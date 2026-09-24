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
import { STRINGS, t } from './strings';

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
    entry,
  };
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
              {/* Beta: folder adoption is not built (`App.onOpenFolder` is a no-op), so this
                  control is honestly disabled rather than a dead affordance — the same treatment
                  as the secondary card below. The copy and the prop are kept for the slice that
                  builds adoption; see the watch items in CONTINUITY. */}
              <button
                type="button"
                className="btn btn-secondary hit-slop"
                disabled
                aria-disabled="true"
                onClick={onOpenFolder}
              >
                {STRINGS.home.openExistingFolderEmpty}
              </button>
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
                    <span className="project-card-thumb" aria-hidden="true" />
                    <span className="project-card-title">{card.title}</span>
                    <span className="project-card-meta mono">
                      {t(STRINGS.home.projectCardMeta, {
                        sheetCount: card.sheetCount,
                        size: '—',
                        time: '—',
                      })}
                    </span>
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
                      {/* Same honesty rule as the secondary card: locating a moved folder is
                          the unbuilt adoption path, so the link is disabled, not dead. */}
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
              {/* Beta: folder adoption is not built — `App` stubs `onOpenFolder` as a
                  no-op. The card stays visible and keeps its copy, but is honestly
                  disabled (`disabled` + `aria-disabled`, keyboard-skipped) so it never
                  reads as a live affordance. `btn` reuses the `.btn:disabled` visual
                  language (opacity + `not-allowed`); the dashed card look is unchanged. */}
              <button
                type="button"
                className="btn project-card project-card-secondary hit-slop"
                disabled
                aria-disabled="true"
                onClick={onOpenFolder}
              >
                {STRINGS.home.openExistingFolder}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
