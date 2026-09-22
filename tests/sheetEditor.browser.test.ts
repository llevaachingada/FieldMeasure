/**
 * tests/sheetEditor.browser.test.ts — F1 wiring proof (slice 1.3 review).
 *
 * The pure predicate test (`tests/dragPredicate.test.ts`) proves `decideDragTarget`
 * returns `'pan'`; it does NOT prove `SheetEditor` CONSUMES that result. This file
 * mounts the real `SheetEditor` (real `EditorCanvas`, real Konva stage, real pointer
 * listeners), simulates a one-finger drag on an empty canvas, and asserts the stage
 * actually panned.
 *
 * Browser project only: it constructs a `Konva.Stage` (D40). The storage layer is
 * mocked so no File System Access / OPFS project is needed; an empty project renders
 * the empty state while the canvas and its input wiring are fully live.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import Konva from 'konva';
import SheetEditor from '../src/ui/SheetEditor';
import { EditorCanvas } from '../src/editor/EditorCanvas';
import { useAppStore } from '../src/state/appStore';
import { STRINGS } from '../src/ui/strings';

// No project on disk: the editor opens, finds zero sheets, and stops at the empty
// state — the canvas + input handlers are still constructed and live.
vi.mock('@/fs/projectStore', async (importOriginal) => ({
  // Spread the REAL module first (session 15, D90 follow-up): presets.ts resolves its
  // projectStore bindings at use time from this namespace (D84/D91), so any binding the
  // factory omits arrives as `undefined` and loadPresets throws PresetsBindingError at
  // use time. The explicit vi.fn() overrides below replace only what this suite drives;
  // everything else stays real so an incomplete factory can never silently re-create
  // the missing-export failure mode.
  ...(await importOriginal<typeof import('@/fs/projectStore')>()),
  registerOpenProject: vi.fn(),
  // This suite does not exercise presets: report `.fieldmeasure/` as absent so
  // loadPresets resolves to { ok: true, presets: empty } (a fresh project),
  // never a PresetsBindingError from the real resolver spread in above.
  resolveFieldMeasureDir: vi.fn(async () => {
    throw new DOMException('no .fieldmeasure dir in this suite', 'NotFoundError');
  }),
  clearOpenProject: vi.fn(),
  acquireWriterLease: vi.fn(async () => ({ held: true, release: vi.fn() })),
  openProjectChannel: vi.fn(() => null),
  resolveOpenProjectDir: vi.fn(async () => ({ kind: 'directory', name: 'f' })),
  cleanStaleTmp: vi.fn(async () => undefined),
  readProjectFile: vi.fn(async () => ({
    schemaVersion: 1,
    project: {
      id: 'p',
      title: 'P',
      unitSystem: 'imperial',
      unitFormat: 'ft-in',
      precisionDenominator: 16,
    },
    sheets: [],
  })),
  isPhotoDamaged: vi.fn(async () => false),
  resolveSheetDir: vi.fn(async () => ({ kind: 'directory', name: 'sheet' })),
  resolveAssetsDir: vi.fn(async () => ({ kind: 'directory', name: 'assets' })),
  writeAtomic: vi.fn(async () => undefined),
  writeJsonAtomic: vi.fn(async () => undefined),
  readSheetMarkup: vi.fn(async () => ({ schemaVersion: 1, sheetId: 's', objects: [] })),
  // persistQueue (imported by SheetEditor since slice 1.6) classifies failures with
  // this class and calls the write helpers above.
  StorageWriteError: class StorageWriteError extends Error {
    kind: string;
    constructor(kind: string, cause?: unknown) {
      super('write failed');
      this.kind = kind;
      this.cause = cause;
    }
  },
}));

afterEach(cleanup);

async function mountEditor(
  props: Record<string, unknown> = {},
): Promise<{ host: HTMLDivElement; stage: Konva.Stage; origin: { x: number; y: number } }> {
  const view = render(
    createElement(SheetEditor, {
      projectId: 'p:f',
      folderName: 'f',
      onExit: () => {},
      ...props,
    }),
  );
  // The open flow ran to the empty state, so the canvas + listeners exist.
  await screen.findByText(STRINGS.project.noSheetsEmpty);

  const host = view.container.querySelector('.editor-canvas') as HTMLDivElement;
  // No app stylesheet in tests: size the host directly so the 24 px edge band is real
  // (a 0×0 host would make every point "edge-born", which classifies as 'navigate' and
  // would mask the F1 bug).
  host.style.width = '800px';
  host.style.height = '600px';

  const stage = Konva.stages[Konva.stages.length - 1];
  const rect = host.getBoundingClientRect();
  return { host, stage, origin: { x: rect.left + 400, y: rect.top + 300 } };
}

function pointer(type: string, target: Element, x: number, y: number): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      buttons: 1,
      clientX: x,
      clientY: y,
    }),
  );
}

describe('F1 — one-finger drag on empty canvas consumes decideDragTarget', () => {
  it('pans, even though «Touch places and moves» is ON (router intent = draw)', async () => {
    const { host, stage, origin } = await mountEditor();
    expect(stage.position()).toEqual({ x: 0, y: 0 });

    pointer('pointerdown', host, origin.x, origin.y);
    pointer('pointermove', host, origin.x + 120, origin.y + 40);
    pointer('pointerup', host, origin.x + 120, origin.y + 40);

    // Before the fix this stayed {0,0}: panning was gated on intent === 'navigate',
    // but a touch with «Touch places and moves» ON classifies as 'draw'.
    expect(stage.position().x).toBeCloseTo(120, 0);
    expect(stage.position().y).toBeCloseTo(40, 0);
  });

  it('does NOT pan while a placement is pending (pending beats pan)', async () => {
    const { host, stage, origin } = await mountEditor({
      activeTool: 'place',
      placementPending: true,
    });

    pointer('pointerdown', host, origin.x, origin.y);
    pointer('pointermove', host, origin.x + 120, origin.y + 40);
    pointer('pointerup', host, origin.x + 120, origin.y + 40);

    expect(stage.position()).toEqual({ x: 0, y: 0 });
  });
});

describe('F2 — double-tap fit↔100% is not gated on the touch toggle', () => {
  it('still toggles when «Touch places and moves» is OFF (router intent = navigate)', async () => {
    const spy = vi.spyOn(EditorCanvas.prototype, 'toggleFitOrFull');
    useAppStore.setState({ touchPlaces: false, penOnly: false });
    try {
      const { host, origin } = await mountEditor();
      // Two taps inside the 320 ms / 24 px double-tap window.
      pointer('pointerdown', host, origin.x, origin.y);
      pointer('pointerup', host, origin.x, origin.y);
      pointer('pointerdown', host, origin.x + 2, origin.y + 2);
      pointer('pointerup', host, origin.x + 2, origin.y + 2);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
      useAppStore.setState({ touchPlaces: true });
    }
  });
});
