/** R2: every action from every route. Illegal transitions leave the state untouched. */
import { describe, expect, it } from 'vitest';
import { appRouteReducer, type AppRoute, type AppRouteAction } from '@/ui/appRoute';

const P = { projectId: 'p1:Kitchen', folderName: 'Kitchen' };
const Q = { projectId: 'p2:Bath', folderName: 'Bath' };

const ROUTES: Record<AppRoute['name'], AppRoute> = {
  loading: { name: 'loading' },
  'first-run': { name: 'first-run' },
  home: { name: 'home' },
  settings: { name: 'settings' },
  project: { name: 'project', project: P },
  editor: { name: 'editor', project: P, sheetId: 's1', intent: 'none' },
};

const ACTIONS: Record<AppRouteAction['type'], AppRouteAction> = {
  booted: { type: 'booted', hasRoot: true },
  firstRunDone: { type: 'firstRunDone' },
  openSettings: { type: 'openSettings' },
  goHome: { type: 'goHome' },
  openProject: { type: 'openProject', project: Q },
  openSheet: { type: 'openSheet', sheetId: 's9' },
  openImport: { type: 'openImport' },
  openExport: { type: 'openExport' },
  exitEditor: { type: 'exitEditor' },
};

const SAME = 'same' as const;
/** Expected result per [route][action]; `SAME` means the very same state object comes back. */
const TABLE: Record<AppRoute['name'], Record<AppRouteAction['type'], AppRoute | typeof SAME>> = {
  loading: {
    booted: { name: 'home' },
    firstRunDone: SAME,
    openSettings: SAME,
    goHome: { name: 'home' },
    openProject: SAME,
    openSheet: SAME,
    openImport: SAME,
    openExport: SAME,
    exitEditor: SAME,
  },
  'first-run': {
    booted: SAME,
    firstRunDone: { name: 'home' },
    openSettings: SAME,
    goHome: { name: 'home' },
    openProject: SAME,
    openSheet: SAME,
    openImport: SAME,
    openExport: SAME,
    exitEditor: SAME,
  },
  home: {
    booted: SAME,
    firstRunDone: SAME,
    openSettings: { name: 'settings' },
    goHome: SAME,
    openProject: { name: 'project', project: Q },
    openSheet: SAME,
    openImport: SAME,
    openExport: SAME,
    exitEditor: SAME,
  },
  settings: {
    booted: SAME,
    firstRunDone: SAME,
    openSettings: SAME,
    goHome: { name: 'home' },
    openProject: SAME,
    openSheet: SAME,
    openImport: SAME,
    openExport: SAME,
    exitEditor: SAME,
  },
  project: {
    booted: SAME,
    firstRunDone: SAME,
    openSettings: SAME,
    goHome: { name: 'home' },
    openProject: SAME,
    openSheet: { name: 'editor', project: P, sheetId: 's9', intent: 'none' },
    openImport: { name: 'editor', project: P, intent: 'import' },
    openExport: { name: 'editor', project: P, intent: 'export' },
    exitEditor: SAME,
  },
  editor: {
    booted: SAME,
    firstRunDone: SAME,
    openSettings: SAME,
    goHome: { name: 'home' },
    openProject: SAME,
    openSheet: { name: 'editor', project: P, sheetId: 's9', intent: 'none' },
    openImport: SAME,
    openExport: SAME,
    exitEditor: { name: 'project', project: P },
  },
};

describe('appRouteReducer', () => {
  for (const [routeName, row] of Object.entries(TABLE)) {
    for (const [actionType, expected] of Object.entries(row)) {
      it(`${routeName} + ${actionType}`, () => {
        const state = ROUTES[routeName as AppRoute['name']];
        const next = appRouteReducer(state, ACTIONS[actionType as AppRouteAction['type']]);
        if (expected === SAME) expect(next).toBe(state);
        else expect(next).toEqual(expected);
      });
    }
  }

  it('booted without a projects root goes to first run', () => {
    expect(appRouteReducer({ name: 'loading' }, { type: 'booted', hasRoot: false })).toEqual({
      name: 'first-run',
    });
  });

  it('leaving the editor keeps the very same project reference (the grid loader keys on it)', () => {
    const editor: AppRoute = { name: 'editor', project: P, intent: 'import' };
    const next = appRouteReducer(editor, { type: 'exitEditor' });
    expect(next.name === 'project' && next.project).toBe(P);
  });
});
