/**
 * The app shell's route as one value (beta-readiness plan R2). It replaces four pieces of
 * `useState` in `App` (`route`, `editorTarget`, `editorSheetId`, `importOnOpen`) that had to be kept
 * in step by hand. The project is carried by the route itself, so "the editor route with no project"
 * can no longer be represented.
 *
 * Pure, with no React. An action that does not apply to the current route returns the state
 * unchanged. It never throws.
 */

/** D51: the runtime key `${id}:${folderName}` and the folder it names. */
export interface ProjectRef {
  projectId: string;
  folderName: string;
}

export type AppRoute =
  | { name: 'loading' }
  | { name: 'first-run' }
  | { name: 'home' }
  | { name: 'settings' }
  | { name: 'project'; project: ProjectRef }
  | { name: 'editor'; project: ProjectRef; sheetId?: string; intent: 'none' | 'import' | 'export' };

export type AppRouteAction =
  | { type: 'booted'; hasRoot: boolean }
  | { type: 'firstRunDone' }
  | { type: 'openSettings' }
  | { type: 'goHome' }
  | { type: 'openProject'; project: ProjectRef }
  | { type: 'openSheet'; sheetId: string }
  | { type: 'openImport' }
  | { type: 'openExport' }
  | { type: 'exitEditor' };

export function appRouteReducer(state: AppRoute, action: AppRouteAction): AppRoute {
  switch (action.type) {
    case 'booted':
      return state.name === 'loading' ? { name: action.hasRoot ? 'home' : 'first-run' } : state;
    case 'firstRunDone':
      return state.name === 'first-run' ? { name: 'home' } : state;
    case 'openSettings':
      return state.name === 'home' ? { name: 'settings' } : state;
    case 'goHome':
      // Settings' back, the grid's back, and the route error boundary's reset (which may fire
      // from any route, exactly as the old `setRoute('home')` could).
      return state.name === 'home' ? state : { name: 'home' };
    case 'openProject':
      return state.name === 'home' ? { name: 'project', project: action.project } : state;
    case 'openSheet':
      // From the grid: open that sheet. In the editor: a capture launched there just wrote a
      // sheet, and the editor switches to it (the intent is unchanged, as before).
      if (state.name === 'project') {
        return { name: 'editor', project: state.project, sheetId: action.sheetId, intent: 'none' };
      }
      if (state.name === 'editor') return { ...state, sheetId: action.sheetId };
      return state;
    case 'openImport':
      return state.name === 'project' ? { name: 'editor', project: state.project, intent: 'import' } : state;
    case 'openExport':
      return state.name === 'project' ? { name: 'editor', project: state.project, intent: 'export' } : state;
    case 'exitEditor':
      return state.name === 'editor' ? { name: 'project', project: state.project } : state;
  }
}
