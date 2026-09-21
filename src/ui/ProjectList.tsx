/**
 * Home — Projects (UI §11.1; implementation plan slice 0.3 step 4).
 *
 * A faithful SHELL: the real folder scan is slice 1.2, so the grid renders from
 * `appStore.projects` (empty on a fresh install → the honest empty state) with
 * `SAMPLE_PROJECTS` exported for the card-layout states. States: empty, loading
 * (6 skeletons) and the card grid (3 cols @1440 / 2 @1200 / 1 @960).
 */
import type { ProjectSummary } from '@/state/appStore';
import { useAppStore } from '@/state/appStore';
import { STRINGS, t } from './strings';

export interface ProjectListProps {
  /** Override the store list (tests / placeholder) — defaults to `appStore.projects`. */
  projects?: ProjectSummary[];
  /** Explicit state override; `'auto'` derives it from the list length. */
  state?: 'auto' | 'loading' | 'empty' | 'ready';
  onNewProject?: () => void;
  onOpenFolder?: () => void;
  onOpenProject?: (id: string) => void;
  onOpenSettings?: () => void;
}

/** Placeholder data for the card grid until slice 1.2 scans the folder. */
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

export default function ProjectList({
  projects,
  state = 'auto',
  onNewProject,
  onOpenFolder,
  onOpenProject,
  onOpenSettings,
}: ProjectListProps) {
  const storeProjects = useAppStore((s) => s.projects);
  const list = projects ?? storeProjects;
  const resolved = state === 'auto' ? (list.length === 0 ? 'empty' : 'ready') : state;

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
        {resolved === 'loading' ? (
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
              <button type="button" className="btn btn-secondary hit-slop" onClick={onOpenFolder}>
                {STRINGS.home.openExistingFolderEmpty}
              </button>
            </div>
          </section>
        ) : (
          <section className="home-section">
            <h2 className="home-section-header">{STRINGS.home.recentHeader}</h2>
            <div className="project-grid">
              {list.map((project) => (
                <article key={project.id} className="project-card">
                  <button
                    type="button"
                    className="project-card-open hit-slop"
                    aria-label={project.title}
                    onClick={() => onOpenProject?.(project.id)}
                  >
                    <span className="project-card-thumb" aria-hidden="true" />
                    <span className="project-card-title">{project.title}</span>
                    <span className="project-card-meta mono">
                      {t(STRINGS.home.projectCardMeta, {
                        sheetCount: project.sheetCount,
                        size: '—',
                        time: '—',
                      })}
                    </span>
                    <span className="project-card-path mono">
                      {t(STRINGS.home.projectCardPath, { path: project.path })}
                    </span>
                  </button>
                  {project.status !== 'ok' ? (
                    <p className="project-card-status">
                      {STRINGS.home.folderNotFound}{' '}
                      <button type="button" className="link-button" onClick={onOpenFolder}>
                        {STRINGS.home.locate}
                      </button>
                    </p>
                  ) : null}
                </article>
              ))}
              <button
                type="button"
                className="project-card project-card-secondary hit-slop"
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
