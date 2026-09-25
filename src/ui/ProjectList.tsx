/**
 * Home — Projects (UI §11.1; implementation plan slice 1.2 step 8, session-4 §5.8c).
 *
 * Slice 0.3 shipped this as a shell rendering `appStore.projects`. It now performs the
 * real scan: read the ROOT projects folder, read every subfolder's `project.json`, and
 * key each card by the FILE's `id` — never the folder name (Explorer renames are
 * cosmetic, §5.6).
 *
 * Duplicate ids (§5.8c): the sanctioned sharing model is copying a project folder, so
 * two folders carrying one id is expected. A folder whose id is shared is shown as its
 * own card, the non-most-recently-modified ones are badged «Copy», in-memory projects
 * are keyed `id + folderName`, and each copy offers «Make this a separate project»
 * (mint a new id, rewrite that folder's `project.json` atomically). Two folders are
 * NEVER merged and a folder the user did not open is NEVER written to.
 *
 * States retained from slice 0.3: empty / loading (6 skeletons) / ready + the card
 * grid (3 cols @1440 / 2 @1200 / 1 @960). The `projects` / `state` props remain as
 * explicit overrides for layout tests; `scan` / `separate` are injectable so the
 * component can be tested in jsdom without the File System Access API.
 */
import { useEffect, useMemo, useState } from 'react';
import { Image } from 'lucide-react';
import type { ProjectSummary } from '@/state/appStore';
import { useAppStore } from '@/state/appStore';
import {
  ensureRootAccess,
  makeProjectSeparate,
  pickRoot,
  queryRootWritePermission,
  scanProjects,
  type ScannedProject,
} from '@/fs/projectStore';
import { clockLabel } from '@/fs/projectSheets';
import HelpButton from './HelpButton';
import { STRINGS, sheetCountLabel, t } from './strings';
import './home.css';

/** The projects-root grant, as Home needs it (see `ProjectListProps.access`). */
export interface RootAccess {
  query: () => Promise<'granted' | 'prompt' | 'denied' | 'unknown'>;
  request: () => Promise<boolean>;
  repick: () => Promise<void>;
}

const DEFAULT_ACCESS: RootAccess = {
  query: queryRootWritePermission,
  request: () => ensureRootAccess({ request: true }),
  repick: () => pickRoot(),
};

export interface ProjectListProps {
  /** Override the store list (tests / placeholder) — bypasses the folder scan. */
  projects?: ProjectSummary[];
  /** Explicit state override; `'auto'` derives it from the list length. */
  state?: 'auto' | 'loading' | 'empty' | 'ready';
  /** Injectable folder scan (tests). Defaults to `projectStore.scanProjects`. */
  scan?: () => Promise<ScannedProject[]>;
  /** Injectable «Make this a separate project» (tests). */
  separate?: (entry: ScannedProject) => Promise<void>;
  /**
   * Injectable folder-grant plumbing (tests). Defaults to the real `projectStore` functions:
   * report the root's write permission, ask for it inside a gesture, re-pick the root.
   */
  access?: RootAccess;
  onNewProject?: () => void;
  onOpenFolder?: () => void;
  /** `folderName` identifies WHICH folder on disk (duplicate ids share an id). */
  onOpenProject?: (id: string, folderName?: string) => void;
  onOpenSettings?: () => void;
  /** D141: loads a card's cover image. The shell wires `projectStore.readProjectCover`;
   *  absent → no image. */
  loadCover?: (folderName: string) => Promise<Blob | null>;
}

/** Placeholder data for the card-layout states. */
export const SAMPLE_PROJECTS: ProjectSummary[] = [
  {
    id: 'sample-riverside',
    title: 'Riverside Elementary',
    sheetCount: 12,
    thumbPath: null,
    path: 'Documents\\FieldMeasure\\Riverside',
    status: 'ok',
  },
  {
    id: 'sample-elm',
    title: 'Elm Street Footings',
    sheetCount: 5,
    thumbPath: null,
    path: 'Documents\\FieldMeasure\\ElmStreet',
    status: 'ok',
  },
  {
    id: 'sample-depot',
    title: 'Depot Retrofit',
    sheetCount: 23,
    thumbPath: null,
    path: 'D:\\Sites\\Depot',
    status: 'missing',
  },
];

const SKELETON_COUNT = 6;

/** What a card renders, from either the scan or an explicit `projects` override. */
interface CardModel {
  /** In-memory key: `id + folderName` when scanned (§5.8c). */
  key: string;
  id: string;
  folderName: string;
  title: string;
  sheetCount: number;
  path: string;
  status: ProjectSummary['status'];
  /** A duplicate-id folder that is not the most recently modified one. */
  isCopy: boolean;
  /** D141: the card's meta line's «time» half — 0 for a non-scanned (summary) card. */
  updatedAtMs: number;
  entry?: ScannedProject;
}

function fromSummary(project: ProjectSummary): CardModel {
  return {
    key: project.id,
    id: project.id,
    folderName: '',
    title: project.title,
    sheetCount: project.sheetCount,
    path: project.path,
    status: project.status,
    isCopy: false,
    updatedAtMs: 0,
  };
}

function fromScan(entry: ScannedProject): CardModel {
  return {
    key: entry.key,
    id: entry.id,
    folderName: entry.folderName,
    title: entry.title,
    sheetCount: entry.sheetCount,
    path: entry.path,
    status: entry.status === 'ok' ? 'ok' : 'missing',
    isCopy: entry.isDuplicate && !entry.isMostRecent,
    updatedAtMs: entry.updatedAtMs,
    entry,
  };
}

/** D141: today → the clock (`2:14 PM`, the grid's `clockLabel`); otherwise a short date
 *  (`Sep 24`); 0 → ''. */
export function cardTimeLabel(ms: number, now: Date = new Date()): string {
  if (!ms) return '';
  const at = new Date(ms);
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  if (sameDay) return clockLabel(at.toISOString());
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** D141: «{sheetCount} · {time}», or just the sheet count when there is no time to show
 *  (a non-scanned summary card, `updatedAtMs === 0`) — never a trailing « · ». */
function cardMetaLabel(card: CardModel): string {
  const time = cardTimeLabel(card.updatedAtMs);
  const sheets = sheetCountLabel(card.sheetCount);
  return time === '' ? sheets : t(STRINGS.home.projectCardMetaShort, { sheetCount: sheets, time });
}

interface ProjectCoverProps {
  folderName: string;
  /** D141: loads a card's cover image. The shell wires `projectStore.readProjectCover`;
   *  absent → no image. */
  loadCover?: (folderName: string) => Promise<Blob | null>;
}

/** The card's cover — the project's first live sheet's `thumb.jpg`, or the honest
 *  placeholder icon when there is none (no `loadCover`, or it resolves `null`). */
function ProjectCover({ folderName, loadCover }: ProjectCoverProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!loadCover) {
      setUrl(null);
      return;
    }
    let alive = true;
    let created = '';
    void loadCover(folderName).then((blob) => {
      if (!alive || !blob) return;
      try {
        // jsdom has no `createObjectURL`; there the card simply shows the placeholder.
        created = URL.createObjectURL(blob);
      } catch {
        created = '';
      }
      if (created) setUrl(created);
    });
    return () => {
      alive = false;
      if (!created) return;
      try {
        URL.revokeObjectURL(created);
      } catch {
        // Revoking is best-effort; a leaked URL is not worth a crash.
      }
    };
  }, [folderName, loadCover]);

  return (
    <span className="project-card-thumb" aria-hidden="true">
      {url ? (
        <img className="project-card-cover" src={url} alt="" />
      ) : (
        <Image className="project-card-cover-icon" size={32} aria-hidden="true" />
      )}
    </span>
  );
}

export default function ProjectList({
  projects,
  state = 'auto',
  scan,
  separate,
  access,
  onNewProject,
  onOpenFolder,
  onOpenProject,
  onOpenSettings,
  loadCover,
}: ProjectListProps) {
  const storeProjects = useAppStore((s) => s.projects);
  const [scanned, setScanned] = useState<ScannedProject[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  /**
   * The projects root's grant when it needs the user: `prompt` (re-askable in a tap) or `denied`
   * (only a re-pick can fix it). `null` = fine, or not a question this browser asks.
   */
  const [lapsed, setLapsed] = useState<'prompt' | 'denied' | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const scanning = projects === undefined && state === 'auto';
  const rootAccess = access ?? DEFAULT_ACCESS;

  const runScan = useMemo(
    () => scan ?? (() => scanProjects()),
    [scan],
  );

  /**
   * Check the grant, then scan. The persisted folder HANDLE survives a reload but its grant does
   * not (§5.2), and a scan without a grant throws. That throw used to fall through to the EMPTY
   * state («Projects are just folders…») — Home looked as if the folder setting had been lost, so
   * the owner re-chose the folder in Settings after every relaunch. Now a lapsed grant is named,
   * with the one-tap recovery that can fix it, and the saved folder is never touched.
   */
  const load = useMemo(
    () => async (isAlive: () => boolean) => {
      // Both start now, in parallel: the grant check adds no latency to the scan.
      const [grant, result] = await Promise.allSettled([rootAccess.query(), runScan()]);
      if (!isAlive()) return;
      let next: 'prompt' | 'denied' | null = null;
      if (grant.status === 'fulfilled' && (grant.value === 'prompt' || grant.value === 'denied')) {
        next = grant.value;
      }
      if (result.status === 'fulfilled') {
        setScanned(result.value);
      } else {
        // A permission throw with no lapse reported (a browser that answered `granted` and then
        // refused) is still a grant problem, never an empty folder.
        const name = (result.reason as { name?: unknown } | null)?.name;
        if (next === null && (name === 'NotAllowedError' || name === 'SecurityError')) next = 'prompt';
        // Unreachable/unusable root: fall back to the honest empty state rather than a crash.
        setScanned([]);
      }
      setLapsed(next);
    },
    [rootAccess, runScan],
  );

  useEffect(() => {
    if (!scanning) return;
    let alive = true;
    void load(() => alive);
    return () => {
      alive = false;
    };
    // `load` is rebuilt when an injected `access` object changes identity; the real default is
    // a module constant, so this effect runs once per mount in the app.
  }, [scanning, runScan]);

  /** The banner's button — a user gesture, so the browser may show its permission prompt. */
  async function reconnect(): Promise<void> {
    setReconnecting(true);
    try {
      if (lapsed === 'denied') {
        await rootAccess.repick();
      } else if (!(await rootAccess.request())) {
        // Refused (or dismissed): ask the browser which recovery is left.
        const now = await rootAccess.query().catch(() => 'unknown' as const);
        setLapsed(now === 'denied' ? 'denied' : 'prompt');
        return;
      }
      await load(() => true);
    } catch {
      // A cancelled re-pick changes nothing; the banner stays and can be tried again.
    } finally {
      setReconnecting(false);
    }
  }

  const cards: CardModel[] = useMemo(() => {
    if (projects !== undefined) return projects.map(fromSummary);
    if (!scanning) return storeProjects.map(fromSummary);
    return (scanned ?? []).map(fromScan);
  }, [projects, scanning, scanned, storeProjects]);

  const resolved =
    state !== 'auto' ? state : scanning && scanned === null ? 'loading' : cards.length === 0 ? 'empty' : 'ready';

  async function handleSeparate(entry: ScannedProject): Promise<void> {
    setBusyKey(entry.key);
    try {
      const run =
        separate ?? ((e: ScannedProject) => makeProjectSeparate(e.folderName, e.id).then(() => undefined));
      await run(entry);
      const entries = await runScan();
      setScanned(entries);
    } catch {
      // The card stays as-is; the user can retry.
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <main className="home">
      <header className="home-bar">
        <h1 className="home-mark">{STRINGS.home.appName}</h1>
        <div className="home-bar-spacer" />
        {/* D152: Help is reachable from Home too. */}
        <HelpButton />
        <button type="button" className="btn btn-primary hit-slop" onClick={onNewProject}>
          {STRINGS.home.newProject}
        </button>
        {onOpenSettings ? (
          <button
            type="button"
            className="btn btn-secondary hit-slop"
            aria-label={STRINGS.editor.menuSettings}
            onClick={onOpenSettings}
          >
            {STRINGS.editor.menuSettings}
          </button>
        ) : null}
      </header>

      <div className="home-body">
        {lapsed !== null ? (
          <section className="home-access" role="alert">
            {/* Approved copy only: the same cause line and the same two recoveries the capture
                overlay already uses (appendix-strings.md:354/355, `storage.rePickFolder`). */}
            <p className="home-access-message">{STRINGS.errors.folderPermissionExpired}</p>
            <button
              type="button"
              className="btn btn-primary hit-slop"
              disabled={reconnecting}
              aria-busy={reconnecting}
              onClick={() => void reconnect()}
            >
              {lapsed === 'denied' ? STRINGS.storage.rePickFolder : STRINGS.errors.reAuthorize}
            </button>
          </section>
        ) : null}
        {lapsed !== null && resolved === 'empty' ? null : resolved === 'loading' ? (
          <section className="home-section" aria-busy="true" aria-label={STRINGS.home.loading}>
            <h2 className="home-section-header">{STRINGS.home.recentHeader}</h2>
            <div className="project-grid">
              {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                <div key={i} className="skeleton-card" aria-hidden="true" />
              ))}
            </div>
          </section>
        ) : resolved === 'empty' ? (
          <section className="home-empty">
            <h2>{STRINGS.home.emptyHeadline}</h2>
            <p>{STRINGS.home.emptyBody}</p>
            <div className="home-empty-actions">
              <button type="button" className="btn btn-primary hit-slop" onClick={onNewProject}>
                {STRINGS.home.createProject}
              </button>
              {/* D141: adoption is unbuilt, so its controls are hidden rather than shown
                  disabled — a permanently disabled control on the first screen a tester sees
                  read as broken (review F5). */}
            </div>
          </section>
        ) : (
          <section className="home-section">
            <h2 className="home-section-header">{STRINGS.home.recentHeader}</h2>
            <div className="project-grid">
              {cards.map((card) => (
                <article className="project-card" key={card.key} data-project-key={card.key}>
                  <button
                    type="button"
                    className="project-card-open hit-slop"
                    aria-label={card.title}
                    onClick={() => onOpenProject?.(card.id, card.folderName || undefined)}
                  >
                    <ProjectCover folderName={card.folderName} loadCover={loadCover} />
                    <span className="project-card-title">{card.title}</span>
                    <span className="project-card-meta mono">{cardMetaLabel(card)}</span>
                    <span className="project-card-path mono">
                      {t(STRINGS.home.projectCardPath, { path: card.path })}
                    </span>
                  </button>
                  {card.isCopy ? (
                    <p className="project-card-status">
                      <span data-copy-badge="true">{STRINGS.project.duplicateIdBadge}</span>{' '}
                      <button
                        type="button"
                        className="link-button hit-slop"
                        aria-label={`${STRINGS.project.makeSeparateProject}: ${card.folderName}`}
                        disabled={busyKey === card.key}
                        onClick={() => card.entry && void handleSeparate(card.entry)}
                      >
                        {STRINGS.project.makeSeparateProject}
                      </button>
                    </p>
                  ) : null}
                  {card.status !== 'ok' ? (
                    <p className="project-card-status">
                      {STRINGS.home.folderNotFound}{' '}
                      {/* D141: locating a moved folder is the unbuilt adoption path, so the
                          link is disabled, not dead — a moved folder is recovered in Explorer
                          until adoption ships. */}
                      <button
                        type="button"
                        className="link-button hit-slop"
                        disabled
                        aria-disabled="true"
                        onClick={onOpenFolder}
                      >
                        {STRINGS.home.locate}
                      </button>
                    </p>
                  ) : null}
                </article>
              ))}
              {/* D141: adoption is unbuilt, so its controls are hidden rather than shown
                  disabled — the same honesty call as the empty state's button above. */}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
