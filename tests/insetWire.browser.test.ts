/**
 * `tests/insetWire.browser.test.ts` — slice 1.7 (Wave B integration lane): the SHELL
 * wiring neither the engine nor the picker sheet could own, driven through the REAL
 * `SheetEditor` against a real `Konva.Stage` (browser project — D40).
 *
 * Proves the machine half of the 1.7 gate:
 *   - the picker opens from the insert flow and each callback places correctly;
 *   - two insets from one asset have independent children;
 *   - the child round-trip acceptance: place → draw a child dimension INSIDE Focus →
 *     scale ×2 + move the crop window + rotate 30° → save → reload → the child lands on
 *     the same photo-content point (same asset px; same group-local `asset − crop`);
 *   - Focus clips children to the inset; outside markup renders above all insets;
 *   - the Inset rail tool is disabled inside Focus with the nested tooltip;
 *   - Esc exits exactly one level with the selection unchanged (the EditorLayout ladder);
 *   - the Replace-photo warned dialog appears only for different dimensions, and markup
 *     is preserved or removed ONLY by an explicit choice (hold-to-confirm to remove).
 *
 * Storage is mocked; the photo and the inset assets are tiny decodable JPEGs / a mocked
 * worker decode, so no File System Access project is needed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import SheetEditor from '../src/ui/SheetEditor';
import EditorLayout from '../src/ui/EditorLayout';
import { EditorCanvas } from '../src/editor/EditorCanvas';
import { MarkupScene } from '../src/editor/shapes/scene';
import { DEFAULT_STYLE } from '../src/domain/types';
import type { Annotation } from '../src/domain/types';
import type { InsetImageGeometry } from '../src/editor/inset/insetGeometry';
import { assetToSheet } from '../src/editor/inset/insetGeometry';
import { useEditorStore, createInitialEditorState } from '../src/state/editorStore';
import { useAppStore, createInitialAppState } from '../src/state/appStore';
import { storeInsetAsset } from '../src/editor/inset/insetAssets';
import { STRINGS } from '../src/ui/strings';

const h = vi.hoisted(() => ({
  photo: null as File | null,
  markup: { schemaVersion: 1, sheetId: 's', objects: [] as unknown[] },
  /** The dims the mocked `storeInsetAsset` reports, keyed by file name. */
  assetDims: { width: 40, height: 30 } as { width: number; height: number },
}));

vi.mock('@/fs/projectStore', () => ({
  registerOpenProject: vi.fn(),
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
    sheets: [
      {
        id: 's',
        title: 'Sheet 04',
        sortIndex: 0,
        imageWidth: 800,
        imageHeight: 600,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  })),
  isPhotoDamaged: vi.fn(async () => false),
  resolveSheetDir: vi.fn(async () => ({
    kind: 'directory',
    name: 'sheet',
    getFileHandle: async () => ({ getFile: async () => h.photo }),
  })),
  resolveAssetsDir: vi.fn(async () => ({
    kind: 'directory',
    name: 'assets',
    getFileHandle: async (name: string) => ({
      getFile: async () => new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' }),
    }),
  })),
  writeAtomic: vi.fn(async () => undefined),
  writeJsonAtomic: vi.fn(async () => undefined),
  readSheetMarkup: vi.fn(async () => h.markup),
  StorageWriteError: class StorageWriteError extends Error {
    kind: string;
    constructor(kind: string, cause?: unknown) {
      super('write failed');
      this.kind = kind;
      this.cause = cause;
    }
  },
}));

// The asset store is the engine's; only the WRITE is mocked (no FSA project on disk).
vi.mock('@/editor/inset/insetAssets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/editor/inset/insetAssets')>();
  return {
    ...actual,
    storeInsetAsset: vi.fn(async (_dir: unknown, _pid: string, file: File) => ({
      assetId: `hash-${file.name}`,
      width: h.assetDims.width,
      height: h.assetDims.height,
      created: true,
    })),
  };
});

// Decode off the main thread in the app; here a deterministic 40×30 "bitmap".
vi.mock('@/media/thumbnails', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/media/thumbnails')>();
  return {
    ...actual,
    decodeInWorker: vi.fn(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 30;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#8899aa';
      ctx.fillRect(0, 0, 40, 30);
      return { bitmap: canvas, width: 40, height: 30, decodedIn: 'mock' };
    }),
  };
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function pointer(
  type: string,
  target: Element,
  x: number,
  y: number,
  pointerType = 'pen',
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType,
      isPrimary: true,
      buttons: 1,
      clientX: x,
      clientY: y,
    }),
  );
}

function setInputFiles(input: HTMLInputElement, files: File[]): void {
  const dt = new DataTransfer();
  for (const file of files) dt.items.add(file);
  Object.defineProperty(input, 'files', { configurable: true, value: dt.files });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

interface Mounted {
  host: HTMLDivElement;
  canvas: EditorCanvas;
  scene: MarkupScene;
  view: ReturnType<typeof render>;
}

/** Mount the REAL SheetEditor against a tiny decodable photo and expose the scene. */
async function mountEditor(props: Record<string, unknown> = {}): Promise<Mounted> {
  let api: { scene: MarkupScene; canvas: EditorCanvas } | null = null;
  const view = render(
    createElement(SheetEditor, {
      projectId: 'p:f',
      folderName: 'f',
      onExit: () => {},
      activeTool: 'place',
      onSceneReady: (next: { scene: MarkupScene; canvas: EditorCanvas }) => {
        api = next;
      },
      ...props,
    }),
  );
  const host = view.container.querySelector('.editor-canvas') as HTMLDivElement;
  host.style.width = '800px';
  host.style.height = '600px';
  await waitFor(() => expect(api?.canvas.photoSize.width).toBe(800));
  return { host, canvas: api!.canvas, scene: api!.scene, view };
}

function tapImage(mounted: Mounted, image: { x: number; y: number }): void {
  const screenPoint = mounted.canvas.imageToScreen(image);
  const rect = mounted.host.getBoundingClientRect();
  const x = rect.left + screenPoint.x;
  const y = rect.top + screenPoint.y;
  pointer('pointerdown', mounted.host, x, y);
  pointer('pointerup', mounted.host, x, y);
}

async function placeInsetFromDevice(
  mounted: Mounted,
  name = 'inset-a.jpg',
  expectedCount = 1,
  tap: { x: number; y: number } = { x: 400, y: 300 },
): Promise<string> {
  await waitFor(() => expect(screen.queryByTestId('image-inset-picker')).toBeNull());
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  tapImage(mounted, tap);
  const picker = await screen.findByTestId('image-inset-picker');
  expect(picker).toBeTruthy();
  const input = screen.getByTestId('inset-device-input') as HTMLInputElement;
  setInputFiles(input, [new File([new Uint8Array([1])], name, { type: 'image/jpeg' })]);
  await waitFor(() =>
    expect(mounted.scene.list().filter((a) => a.type === 'image')).toHaveLength(expectedCount),
  );
  const images = mounted.scene.list().filter((a) => a.type === 'image');
  return images[images.length - 1].id;
}

beforeEach(() => {
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
  h.markup = { schemaVersion: 1, sheetId: 's', objects: [] };
  h.assetDims = { width: 40, height: 30 };
  // A 2×2 JPEG the browser can actually decode for the sheet photo.
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#336699';
  ctx.fillRect(0, 0, 2, 2);
  h.photo = null;
  return new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      h.photo = new File([blob!], 'photo.jpg', { type: 'image/jpeg' });
      resolve();
    }, 'image/jpeg');
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
  h.photo = null;
});

describe('insert flow through the real editor', () => {
  it('opens the picker from one tap, and cancelling inserts nothing', async () => {
    const mounted = await mountEditor();
    useEditorStore.getState().setActiveTool('inset');
    tapImage(mounted, { x: 400, y: 300 });
    await screen.findByTestId('image-inset-picker');

    const cancel = document.querySelector('[data-inset-picker="cancel"]') as HTMLButtonElement;
    cancel.click();
    await waitFor(() => expect(screen.queryByTestId('image-inset-picker')).toBeNull());
    expect(mounted.scene.list()).toHaveLength(0);
    expect(useEditorStore.getState().pendingOp).toBe('none');
  });

  it('the device picker places an inset at 40% of the sheet width, aspect preserved', async () => {
    const mounted = await mountEditor();
    useEditorStore.getState().setActiveTool('inset');
    const key = await placeInsetFromDevice(mounted);
    const geom = mounted.scene.get(key)!.geometry as InsetImageGeometry;
    expect(geom.width).toBeCloseTo(320, 6); // 800 × 0.40
    expect(geom.height).toBeCloseTo(240, 6); // 320 × (30/40)
    expect(mounted.scene.getNode(key)!.getParent()).toBe(mounted.canvas.insetLayer);
    // The placed inset is selected after insert.
    expect(useEditorStore.getState().selection).toEqual([key]);
  });

  it('the camera picker callback places an inset too', async () => {
    const mounted = await mountEditor();
    useEditorStore.getState().setActiveTool('inset');
    tapImage(mounted, { x: 400, y: 300 });
    await screen.findByTestId('image-inset-picker');
    const input = screen.getByTestId('inset-camera-input') as HTMLInputElement;
    setInputFiles(input, [new File([new Uint8Array([1])], 'camera.jpg', { type: 'image/jpeg' })]);
    await waitFor(() =>
      expect(mounted.scene.list().filter((a) => a.type === 'image')).toHaveLength(1),
    );
  });

  it('a recent pick places from the session cache without writing a second asset', async () => {
    const mounted = await mountEditor();
    useEditorStore.getState().setActiveTool('inset');
    await placeInsetFromDevice(mounted, 'reuse.jpg');
    const writesAfterFirst = vi.mocked(storeInsetAsset).mock.calls.length;

    useEditorStore.getState().clearSelection();
    tapImage(mounted, { x: 650, y: 480 });
    await screen.findByTestId('image-inset-picker');
    const thumb = document.querySelector('[data-inset-picker-recent]') as HTMLButtonElement;
    expect(thumb).toBeTruthy();
    thumb.click();
    await waitFor(() =>
      expect(mounted.scene.list().filter((a) => a.type === 'image')).toHaveLength(2),
    );
    const images = mounted.scene.list().filter((a) => a.type === 'image');
    expect(images[0].assetId).toBe(images[1].assetId);
    // The recents path is a cache hit: it does not re-store (no second write).
    expect(vi.mocked(storeInsetAsset).mock.calls.length).toBe(writesAfterFirst);
  });

  it('two insets from one asset have independent children', async () => {
    const mounted = await mountEditor();
    useEditorStore.getState().setActiveTool('inset');
    const first = await placeInsetFromDevice(mounted, 'shared.jpg');
    // Select the first and give it a child directly through the scene API.
    mounted.scene.addChildAnnotation(first, {
      id: 'child-1',
      type: 'rect',
      geometry: { kind: 'rect', x: 1, y: 1, width: 4, height: 4 },
      valueMm: null,
      enteredText: null,
      style: mounted.scene.get(first)!.style,
      zIndex: 0,
      source: 'manual',
      assetId: null,
      groupId: null,
      locked: false,
    });
    // Clear the selection so the first inset's handles cannot swallow the second tap —
    // at the test's 0.25 fit scale a handle hit radius covers a large image area.
    useEditorStore.getState().clearSelection();
    const second = await placeInsetFromDevice(mounted, 'shared.jpg', 2, { x: 650, y: 480 });    expect(mounted.scene.get(first)!.assetId).toBe(mounted.scene.get(second)!.assetId);
    expect(mounted.scene.childrenOf(first)).toHaveLength(1);
    expect(mounted.scene.childrenOf(second)).toHaveLength(0);
  });
});

describe('the child round-trip acceptance (the 1.7 gate)', () => {
  it('draws a child inside Focus, transforms, saves, reloads — same photo point', async () => {
    const mounted = await mountEditor();
    useEditorStore.getState().setActiveTool('inset');
    const key = await placeInsetFromDevice(mounted);
    const geometry = mounted.scene.get(key)!.geometry as InsetImageGeometry;

    // Enter Focus through the shell's actions HUD.
    (await screen.findByTestId('inset-focus')).click();
    await waitFor(() => expect(useEditorStore.getState().focusInsetId).toBe(key));
    expect(screen.getByTestId('focus-breadcrumb')).toBeTruthy();

    // Draw a child dimension with the REAL dimension machine, inside the inset.
    useEditorStore.getState().setActiveTool('dimension');
    const a = { x: geometry.x + geometry.width * 0.25, y: geometry.y + geometry.height * 0.5 };
    const b = { x: geometry.x + geometry.width * 0.6, y: geometry.y + geometry.height * 0.5 };
    tapImage(mounted, a);
    tapImage(mounted, b);
    await waitFor(() => expect(mounted.scene.childrenOf(key)).toHaveLength(1));

    const child = mounted.scene.childrenOf(key)[0] as Annotation;
    const childPath = `${key}/${child.id}`;
    // The child is INSIDE the inset group (so it is clipped and scales with the inset).
    expect(mounted.scene.getNode(childPath)!.getParent()).toBe(mounted.scene.getNode(key));
    // Stored in ASSET px: the same points the engine's conversion gives.
    const expectedA = mounted.scene.assetPointAt(key, a);
    if (child.geometry.kind === 'dimension') {
      expect(child.geometry.a.x).toBeCloseTo(expectedA!.x, 6);
      expect(child.geometry.a.y).toBeCloseTo(expectedA!.y, 6);
    }

    // Scale ×2 + move the crop window + rotate 30°. Children are never rewritten.
    const crop = { x: 5, y: 3, width: 20, height: 15 };
    const transformed: InsetImageGeometry = {
      ...geometry,
      width: geometry.width * 2,
      height: geometry.height * 2,
      rotation: 30,
      crop,
    };
    mounted.scene.setGeometry(key, transformed);

    const assetPoint = { x: child.geometry.kind === 'dimension' ? child.geometry.a.x : 0,
      y: child.geometry.kind === 'dimension' ? child.geometry.a.y : 0 };
    const mappingBefore = assetToSheet(assetPoint, transformed, crop);
    // The child wrapper carries the SAME −crop offset as the asset image (its own nodes
    // stay at asset px), so a crop-window move never detaches it from the photo.
    expect(mounted.scene.getNode(childPath)!.position().x).toBeCloseTo(-crop.x, 6);
    expect(mounted.scene.getNode(childPath)!.position().y).toBeCloseTo(-crop.y, 6);

    // Save.
    const file = mounted.scene.markupFile('s', 1);
    const json = JSON.stringify(file);
    expect(json).not.toContain('"label"');
    h.markup = { schemaVersion: 1, sheetId: 's', objects: JSON.parse(json).objects };

    cleanup();
    useEditorStore.setState(createInitialEditorState());
    // Reload through the REAL editor.
    const reloaded = await mountEditor();
    await waitFor(() => expect(reloaded.scene.list().some((ann) => ann.type === 'image')).toBe(true));
    const restored = reloaded.scene.list().find((ann) => ann.type === 'image')!;
    const restoredChild = reloaded.scene.get(`${restored.id}/${child.id}`)!;
    expect(restoredChild).toBeTruthy();
    const restoredGeom = restored.geometry as InsetImageGeometry;
    expect(restoredGeom.crop).toEqual(crop);
    expect(restoredGeom.rotation).toBeCloseTo(30, 6);

    // The child is glued to the same photo-content point: same asset px, same mapping.
    if (restoredChild.geometry.kind === 'dimension') {
      expect(restoredChild.geometry.a.x).toBeCloseTo(assetPoint.x, 6);
      expect(restoredChild.geometry.a.y).toBeCloseTo(assetPoint.y, 6);
    }
    expect(
      assetToSheet(assetPoint, restoredGeom, restoredGeom.crop!),
    ).toEqual(mappingBefore);
    expect(reloaded.scene.getNode(`${restored.id}/${child.id}`)!.position().x).toBeCloseTo(
      -crop.x,
      6,
    );
  });
});

describe('layering and Focus clipping', () => {
  it('outside markup lives on the markup layer, above the inset layer', async () => {
    const mounted = await mountEditor();
    useEditorStore.getState().setActiveTool('inset');
    const key = await placeInsetFromDevice(mounted);
    useEditorStore.getState().setActiveTool('rect');
    tapImage(mounted, { x: 100, y: 100 });
    tapImage(mounted, { x: 180, y: 160 });
    await waitFor(() =>
      expect(mounted.scene.list().some((ann) => ann.type === 'rect')).toBe(true),
    );
    const rect = mounted.scene.list().find((ann) => ann.type === 'rect')!;
    expect(mounted.scene.getNode(rect.id)!.getParent()).toBe(mounted.canvas.markupLayer);
    expect(mounted.scene.getNode(key)!.getParent()).toBe(mounted.canvas.insetLayer);
    // §8.1 paint order: inset layer below markup layer.
    const stage = mounted.canvas.stage;
    expect(stage.getLayers().indexOf(mounted.canvas.insetLayer)).toBeLessThan(
      stage.getLayers().indexOf(mounted.canvas.markupLayer),
    );
  });

  it('a child drawn inside Focus is a member of the inset group only (clipped)', async () => {
    const mounted = await mountEditor();
    useEditorStore.getState().setActiveTool('inset');
    const key = await placeInsetFromDevice(mounted);
    useEditorStore.getState().setActiveTool('rect');
    // Not focused: a rect is a TOP-LEVEL annotation.
    tapImage(mounted, { x: 100, y: 100 });
    tapImage(mounted, { x: 160, y: 150 });
    await waitFor(() => expect(mounted.scene.list().some((ann) => ann.type === 'rect')).toBe(true));

    // Enter Focus, then draw another rect: it becomes a CHILD (clipped).
    (await screen.findByTestId('inset-focus')).click();
    await waitFor(() => expect(useEditorStore.getState().focusInsetId).toBe(key));
    useEditorStore.getState().setActiveTool('rect');
    const geometry = mounted.scene.get(key)!.geometry as InsetImageGeometry;
    tapImage(mounted, { x: geometry.x + 40, y: geometry.y + 40 });
    tapImage(mounted, { x: geometry.x + 100, y: geometry.y + 100 });
    await waitFor(() => expect(mounted.scene.childrenOf(key)).toHaveLength(1));
    const child = mounted.scene.childrenOf(key)[0];
    expect(mounted.scene.getNode(`${key}/${child.id}`)!.getParent()).toBe(
      mounted.scene.getNode(key),
    );
    // A child is never a member of a sheet band.
    expect(mounted.scene.entries().some((entry) => entry.key.includes('/'))).toBe(false);
  });
});

describe('Focus entry', () => {
  it('Enter while a single inset is selected enters Focus', async () => {
    const mounted = await mountEditor();
    useEditorStore.getState().setActiveTool('inset');
    const key = await placeInsetFromDevice(mounted);
    expect(useEditorStore.getState().selection).toEqual([key]);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitFor(() => expect(useEditorStore.getState().focusInsetId).toBe(key));
    expect(screen.getByTestId('focus-breadcrumb')).toBeTruthy();
  });
});

describe('Focus shell chrome (EditorLayout)', () => {
  it('disables the Inset rail tool with the nested tooltip, and the breadcrumb is a control', async () => {
    const view = render(
      createElement(EditorLayout, { projectId: 'p:f', folderName: 'f', onExit: () => {} }),
    );
    await waitFor(() =>
      expect((view.container.querySelector('.editor-canvas') as HTMLDivElement)?.isConnected).toBe(true),
    );
    const insetButton = view.container.querySelector('[data-tool="inset"]') as HTMLButtonElement;
    expect(insetButton.disabled).toBe(false);

    useEditorStore.getState().setFocusInsetId('inset-1');
    await waitFor(() => expect(insetButton.disabled).toBe(true));
    expect(insetButton.title).toBe(STRINGS.inset.nestedTooltip);

    const breadcrumb = await screen.findByTestId('focus-breadcrumb');
    expect(breadcrumb.tagName).toBe('BUTTON');
    expect(screen.getByTestId('focus-done').textContent).toBe(STRINGS.editor.done);
    // Focus entry is announced (§19.6): the live region carries the breadcrumb.
    expect(screen.getByTestId('focus-announcement').textContent).toContain(
      STRINGS.tool.imageInset,
    );
  });

  it('Esc follows the §4.2 ladder: deselect, then exit Focus — one rung per press', async () => {
    render(createElement(EditorLayout, { projectId: 'p:f', folderName: 'f', onExit: () => {} }));
    await waitFor(() =>
      expect(
        (document.querySelector('.editor-canvas') as HTMLDivElement)?.isConnected,
      ).toBe(true),
    );
    useEditorStore.getState().setSelection(['inset-1']);
    useEditorStore.getState().setFocusInsetId('inset-1');
    await waitFor(() => expect(useEditorStore.getState().focusInsetId).toBe('inset-1'));

    // Rung 1 — §4.2 de-selects BEFORE exiting Focus, and never advances two rungs at once.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => expect(useEditorStore.getState().selection).toEqual([]));
    expect(useEditorStore.getState().focusInsetId).toBe('inset-1');

    // Rung 2 — now, with nothing selected, Focus exits.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => expect(useEditorStore.getState().focusInsetId).toBeNull());
  });

  it('exiting Focus does not itself change the selection', async () => {
    render(createElement(EditorLayout, { projectId: 'p:f', folderName: 'f', onExit: () => {} }));
    await waitFor(() =>
      expect(
        (document.querySelector('.editor-canvas') as HTMLDivElement)?.isConnected,
      ).toBe(true),
    );
    // With nothing selected the first Esc IS the exit-Focus rung, and the selection is
    // untouched by leaving the inset (the half of the old gate wording that still holds).
    useEditorStore.getState().setSelection([]);
    useEditorStore.getState().setFocusInsetId('inset-1');
    await waitFor(() => expect(useEditorStore.getState().focusInsetId).toBe('inset-1'));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => expect(useEditorStore.getState().focusInsetId).toBeNull());
    expect(useEditorStore.getState().selection).toEqual([]);
  });
});

describe('Replace photo (§8.5 M7)', () => {
  it('different dimensions warns; Keep preserves the markup', async () => {
    const mounted = await mountEditor();
    useEditorStore.getState().setActiveTool('inset');
    const key = await placeInsetFromDevice(mounted);
    mounted.scene.addChildAnnotation(key, {
      id: 'keep-child',
      type: 'rect',
      geometry: { kind: 'rect', x: 1, y: 1, width: 4, height: 4 },
      valueMm: null,
      enteredText: null,
      style: mounted.scene.get(key)!.style,
      zIndex: 0,
      source: 'manual',
      assetId: null,
      groupId: null,
      locked: false,
    });
    expect(mounted.scene.childrenOf(key)).toHaveLength(1);

    h.assetDims = { width: 80, height: 60 };
    const input = screen.getByTestId('inset-replace-input') as HTMLInputElement;
    setInputFiles(input, [new File([new Uint8Array([1])], 'big.jpg', { type: 'image/jpeg' })]);

    const dialog = await screen.findByTestId('replace-photo-dialog');
    expect(dialog.textContent).toContain(STRINGS.project.replacePhotoWarn);
    expect(screen.getByText(STRINGS.project.replacePhotoKeep)).toBeTruthy();

    (screen.getByText(STRINGS.project.replacePhotoKeep) as HTMLButtonElement).click();
    await waitFor(() => expect(screen.queryByTestId('replace-photo-dialog')).toBeNull());
    expect(mounted.scene.childrenOf(key)).toHaveLength(1); // preserved by explicit choice
    expect(mounted.scene.get(key)!.assetId).toBe('hash-big.jpg');
  });

  it('Remove markup is hold-to-confirm and only then clears the children', async () => {
    const mounted = await mountEditor();
    useEditorStore.getState().setActiveTool('inset');
    const key = await placeInsetFromDevice(mounted);
    mounted.scene.addChildAnnotation(key, {
      id: 'remove-child',
      type: 'rect',
      geometry: { kind: 'rect', x: 1, y: 1, width: 4, height: 4 },
      valueMm: null,
      enteredText: null,
      style: mounted.scene.get(key)!.style,
      zIndex: 0,
      source: 'manual',
      assetId: null,
      groupId: null,
      locked: false,
    });

    h.assetDims = { width: 80, height: 60 };
    const input = screen.getByTestId('inset-replace-input') as HTMLInputElement;
    setInputFiles(input, [new File([new Uint8Array([1])], 'big2.jpg', { type: 'image/jpeg' })]);
    const remove = (await screen.findByTestId('replace-remove')) as HTMLButtonElement;

    // A short press does NOT remove (hold-to-confirm).
    remove.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    remove.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
    await sleep(20);
    expect(mounted.scene.childrenOf(key)).toHaveLength(1);
    expect(screen.getByTestId('replace-photo-dialog')).toBeTruthy();

    // A full hold does.
    remove.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    await sleep(700);
    await waitFor(() => expect(screen.queryByTestId('replace-photo-dialog')).toBeNull());
    expect(mounted.scene.childrenOf(key)).toHaveLength(0);
    expect(mounted.scene.get(key)!.assetId).toBe('hash-big2.jpg');
  });

  it('identical dimensions swaps silently (no dialog)', async () => {
    const mounted = await mountEditor();
    useEditorStore.getState().setActiveTool('inset');
    const key = await placeInsetFromDevice(mounted);
    const before = mounted.scene.get(key)!.assetId;
    h.assetDims = { width: 40, height: 30 };
    const input = screen.getByTestId('inset-replace-input') as HTMLInputElement;
    setInputFiles(input, [new File([new Uint8Array([1])], 'same.jpg', { type: 'image/jpeg' })]);
    await waitFor(() => expect(mounted.scene.get(key)!.assetId).not.toBe(before));
    expect(screen.queryByTestId('replace-photo-dialog')).toBeNull();
  });
});

/**
 * MEASUREMENT (reported, not silently "fixed"): ink inside a scaled inset.
 *
 * `EditorCanvas.applyScreenRules` regenerates ink outlines at the CANVAS scale only, not
 * `canvasScale × insetScale`; ink is a FILLED outline and fills ignore `strokeScaleEnabled`.
 * So the on-screen thickness inside an inset is expected to be `strokeWidthMu × insetScale`
 * — invariant to canvas zoom, PROPORTIONAL to the inset's own scale.
 */
describe('ink thickness inside a scaled inset (measurement)', () => {
  const MU = 10;

  function measure(canvas: EditorCanvas, x: number, y: number): number {
    canvas.insetLayer.draw();
    const el = canvas.insetLayer.getNativeCanvasElement();
    const ctx = el.getContext('2d')!;
    const cx = Math.max(0, Math.round(x));
    const top = Math.max(0, Math.round(y) - 60);
    const data = ctx.getImageData(cx, top, 1, 120).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 40) count += 1;
    return count;
  }

  it('measures the on-screen stroke thickness', () => {
    const host = document.createElement('div');
    host.style.position = 'absolute';
    host.style.left = '0';
    host.style.top = '0';
    host.style.width = '600px';
    host.style.height = '600px';
    document.body.appendChild(host);
    const canvas = new EditorCanvas(host, { markupPixelRatio: () => 1 });
    const transparent = document.createElement('canvas');
    transparent.width = 240;
    transparent.height = 180;
    let n = 0;
    const scene = new MarkupScene({
      layer: canvas.markupLayer,
      insetLayer: canvas.insetLayer,
      ctx: { unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 },
      ghostText: '',
      assetProvider: () => ({ image: transparent, width: 240, height: 180 }),
      newId: () => `id-${++n}`,
    });
    const inset = scene.addInset('a', { kind: 'image', x: 0, y: 0, width: 240, height: 180, rotation: 0 });
    const points = Array.from({ length: 25 }, (_v, i) => ({ x: 60 + i * 5, y: 90 }));
    scene.addChildAnnotation(inset.id, {
      id: 'ink-1',
      type: 'freehand',
      geometry: { kind: 'freehand', points, pressure: points.map(() => 0.5) },
      valueMm: null,
      enteredText: null,
      style: { ...DEFAULT_STYLE, strokeColor: '#FF0000', strokeWidthMu: MU },
      zIndex: 0,
      source: 'manual',
      assetId: null,
      groupId: null,
      locked: false,
    });

    // Inset scale 1 (placed 240×180 from a 240×180 crop).
    const scale1 = measure(canvas, 120, 90);

    // Inset scale 2: the same asset point (60,90) now renders at sheet (120,180).
    scene.setGeometry(inset.id, { kind: 'image', x: 0, y: 0, width: 480, height: 360, rotation: 0 });
    const scale2 = measure(canvas, 120, 180);

    // Back to scale 1, then canvas zoom 4× (ink regenerated on zoom).
    scene.setGeometry(inset.id, { kind: 'image', x: 0, y: 0, width: 240, height: 180, rotation: 0 });
    canvas.stage.scale({ x: 4, y: 4 });
    canvas.stage.position({ x: 0, y: 0 });
    canvas.regenerateInk();
    const zoom4 = measure(canvas, 240, 360);

    // eslint-disable-next-line no-console
    console.log(`INK MEASUREMENT mu=${MU} insetScale1=${scale1}px insetScale2=${scale2}px canvasZoom4=${zoom4}px`);

    // The invariant the §4.2 screen rules promise is a constant mu at every canvas zoom.
    expect(zoom4).toBeCloseTo(scale1, 0);
    // Children scale with the inset (§8.5), so the thickness is proportional to insetScale.
    expect(scale2 / Math.max(1, scale1)).toBeGreaterThan(1.6);

    scene.load([]);
    canvas.destroy();
    host.remove();
  });
});

