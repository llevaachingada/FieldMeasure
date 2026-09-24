/**
 * `src/ui/ErrorBoundary.tsx` — D138 (L2): the whole-app and route-level render error
 * boundary (fixes F3: a render crash or a chunk-load failure was a blank page with no
 * recovery). Local only — `console.error` and a `sessionStorage`-guarded reload, never
 * telemetry (AGENTS non-negotiable 8).
 *
 * React 19 still requires a class component for `getDerivedStateFromError` /
 * `componentDidCatch`; there is no hook equivalent.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { STRINGS } from './strings';

const COPY = STRINGS.errorBoundary;
import './errorBoundary.css';

/** sessionStorage key + window for the one-shot chunk-reload guard (a reload loop must be impossible). */
export const CHUNK_RELOAD_KEY = 'fm:chunk-reload-at';
/** Two reloads inside this window mean the reload did not help, so show the fallback instead (60 s). */
export const CHUNK_RELOAD_WINDOW_MS = 60_000;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';
  return (
    name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      message,
    )
  );
}

export interface AppErrorBoundaryProps {
  children: ReactNode;
  /** 'app' = whole-app fallback (Reload only); 'route' = adds «Back to Projects». */
  variant: 'app' | 'route';
  /** Route variant: navigate somewhere safe and clear the error. */
  onReset?: () => void;
  /** Injectable for tests. Default: `window.location.reload()`. */
  reload?: () => void;
  /** Injectable for tests. Default: `Date.now`. */
  now?: () => number;
}

interface State {
  error: unknown | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Local only (AGENTS non-negotiable 8): no telemetry, just the console.
    console.error('[FieldMeasure] render error', error, info.componentStack);
    if (isChunkLoadError(error)) this.tryChunkReload();
  }

  private tryChunkReload(): void {
    const now = (this.props.now ?? Date.now)();
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    } catch {
      /* storage blocked */
    }
    if (now - last < CHUNK_RELOAD_WINDOW_MS) return; // already tried: show the fallback
    try {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
    } catch {
      /* storage blocked */
    }
    (this.props.reload ?? (() => window.location.reload()))();
  }

  private reset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    const reload = this.props.reload ?? (() => window.location.reload());
    return (
      <main className="error-fallback" role="alert">
        <h1 className="error-fallback-title">{COPY.title}</h1>
        <p className="error-fallback-body">{COPY.body}</p>
        <div className="error-fallback-actions">
          <button type="button" className="btn btn-primary hit-slop" onClick={reload}>
            {COPY.reload}
          </button>
          {this.props.variant === 'route' && this.props.onReset ? (
            <button type="button" className="btn btn-secondary hit-slop" onClick={this.reset}>
              {COPY.backToProjects}
            </button>
          ) : null}
        </div>
      </main>
    );
  }
}
