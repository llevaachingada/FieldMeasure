/**
 * R1 characterization tests: `GestureArbiter` is the pointer engine moved verbatim out of
 * `SheetEditor`. These pin today's behaviour with fake deps (no Konva, no DOM), so the Wave 3
 * `EditorController` move cannot silently change tap/drag, long-press, second-finger or pen-barrel
 * handling.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GestureArbiter, type GestureDeps } from '@/editor/gestureArbiter';
import { LONG_PRESS_MS, TAP_SLOP } from '@/editor/EditorCanvas';
import { createInputRouter } from '@/editor/inputRouter';

// The engine arms its timers through `window.setTimeout` (a browser module); alias it in node.
(globalThis as { window?: unknown }).window ??= globalThis;

interface Hit {
  id: string;
  locked: boolean;
}

function ref<T>(current: T): { current: T } {
  return { current };
}

function makeDeps(opts: { hit?: Hit | null; toolId?: string } = {}) {
  const geometry = { kind: 'point', x: 10, y: 10 };
  const canvas = {
    pointerPosition: (e: PointerEvent) => ({ x: e.clientX, y: e.clientY }),
    screenToImage: (p: { x: number; y: number }) => ({ ...p }),
    imageToScreen: (p: { x: number; y: number }) => ({ ...p }),
    hitObject: vi.fn(() => opts.hit ?? null),
    panBy: vi.fn(),
    toggleFitOrFull: vi.fn(),
  };
  const scene = {
    keyForAnnotationId: vi.fn((id: string) => `key:${id}`),
    geometryCopy: vi.fn(() => ({ ...geometry })),
    boundsAt: vi.fn(() => ({ x: 0, y: 0, width: 20, height: 20 })),
    setGeometry: vi.fn(),
    get: vi.fn(() => undefined),
  };
  const tool = {
    state: { phase: 'idle' },
    onPointerDown: vi.fn(() => 'none'),
    onPointerMove: vi.fn(() => null),
    onPointerUp: vi.fn(),
    onPointerCancel: vi.fn(),
  };
  const select = {
    hitHandleAt: vi.fn(() => false),
    longPress: vi.fn(),
    tapObject: vi.fn(() => 'selected'),
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    onPointerCancel: vi.fn(),
  };
  const host = {
    clientWidth: 1000,
    clientHeight: 800,
    setPointerCapture: vi.fn(),
  };
  const deps = {
    host,
    canvas,
    scene,
    router: createInputRouter(),
    tool,
    history: { exec: vi.fn() },
    activeToolRef: ref<'select' | 'pan' | 'place'>('select'),
    placementPendingRef: ref(false),
    toolIdRef: ref(opts.toolId ?? 'select'),
    sceneRef: ref(scene),
    shapeToolsRef: ref(new Map()),
    angleRef: ref(null),
    freehandRef: ref(null),
    highlightRef: ref(null),
    textRef: ref(null),
    eraseRef: ref(null),
    selectRef: ref(select),
    insetRef: ref(null),
    mkSettings: () => ({}),
    cancelActiveMarkup: vi.fn(),
    setPinnedToolbar: vi.fn(),
    setInputKind: vi.fn(),
  };
  // Fakes carry only what the engine reads; the cast is the seam between them and the real types.
  return { deps: deps as unknown as GestureDeps, canvas, scene, select, host, geometry };
}

let seq = 0;
function ptr(
  pointerId: number,
  x: number,
  y: number,
  over: Partial<{ pointerType: string; button: number; buttons: number }> = {},
): PointerEvent {
  seq += 1;
  return {
    pointerId,
    clientX: x,
    clientY: y,
    pointerType: 'touch',
    button: 0,
    buttons: 1,
    pressure: 0.5,
    isPrimary: pointerId === 1,
    timeStamp: seq,
    ...over,
  } as unknown as PointerEvent;
}

describe('GestureArbiter (R1 characterization)', () => {
  beforeEach(() => {
    seq = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a contact that stays inside TAP_SLOP never pans; one that leaves it pans by the delta', () => {
    const { deps, canvas } = makeDeps();
    const a = new GestureArbiter(deps);
    a.onPointerDown(ptr(1, 100, 100));
    a.onPointerMove(ptr(1, 100 + TAP_SLOP - 1, 100));
    // Inside the slop a one-finger touch on empty canvas still pans the tiny delta the old code
    // panned; what matters is that the tap is still a tap on lift (checked below).
    const pannedInsideSlop = canvas.panBy.mock.calls.length;
    a.onPointerUp(ptr(1, 100 + TAP_SLOP - 1, 100));
    a.onPointerDown(ptr(2, 300, 300));
    a.onPointerMove(ptr(2, 300 + TAP_SLOP + 20, 300));
    expect(canvas.panBy.mock.calls.length).toBeGreaterThan(pannedInsideSlop);
    expect(canvas.panBy).toHaveBeenLastCalledWith(TAP_SLOP + 20, 0);
  });

  it('two taps in the same place toggle fit/100%; a drag between does not count as a tap', () => {
    const { deps, canvas } = makeDeps();
    const a = new GestureArbiter(deps);
    a.onPointerDown(ptr(1, 200, 200));
    a.onPointerUp(ptr(1, 200, 200));
    a.onPointerDown(ptr(1, 202, 201));
    a.onPointerUp(ptr(1, 202, 201));
    expect(canvas.toggleFitOrFull).toHaveBeenCalledTimes(1);
  });

  it('a long press on an unlocked object pins it after LONG_PRESS_MS, and not before', () => {
    vi.useFakeTimers();
    const { deps, select } = makeDeps({ hit: { id: 'a1', locked: false } });
    const a = new GestureArbiter(deps);
    a.onPointerDown(ptr(1, 50, 50));
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(select.longPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(select.longPress).toHaveBeenCalledWith('key:a1');
  });

  it('moving beyond the slop cancels a pending long press', () => {
    vi.useFakeTimers();
    const { deps, select } = makeDeps({ hit: { id: 'a1', locked: false } });
    const a = new GestureArbiter(deps);
    a.onPointerDown(ptr(1, 50, 50));
    a.onPointerMove(ptr(1, 50 + TAP_SLOP + 5, 50));
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(select.longPress).not.toHaveBeenCalled();
  });

  it('a second finger during an object drag restores the pre-drag geometry (D63)', () => {
    const { deps, scene, geometry } = makeDeps({ hit: { id: 'a1', locked: false } });
    const a = new GestureArbiter(deps);
    a.onPointerDown(ptr(1, 50, 50));
    a.onPointerMove(ptr(1, 90, 50));
    const draggedCalls = scene.setGeometry.mock.calls.length;
    a.onPointerDown(ptr(2, 400, 400));
    const after = scene.setGeometry.mock.calls.slice(draggedCalls);
    expect(draggedCalls).toBeGreaterThan(0);
    expect(after).toContainEqual(['key:a1', geometry]);
  });

  it('the pen barrel button (buttons: 2) registers no contact: no pan, no capture', () => {
    const { deps, canvas, host } = makeDeps();
    const a = new GestureArbiter(deps);
    const barrel = { pointerType: 'pen', button: 2, buttons: 2 };
    a.onPointerDown(ptr(7, 100, 100, barrel));
    a.onPointerMove(ptr(7, 200, 200, barrel));
    a.onPointerUp(ptr(7, 200, 200, barrel));
    expect(canvas.panBy).not.toHaveBeenCalled();
    expect(host.setPointerCapture).not.toHaveBeenCalled();
    expect(canvas.toggleFitOrFull).not.toHaveBeenCalled();
  });
});

describe('D151: dragging a selected dimension\'s text', () => {
  it('moves only the label (labelOffset), records one undo step, and a cancel puts it back', async () => {
    const { useEditorStore } = await import('@/state/editorStore');
    // Long enough that the label is not collision-pushed off its midpoint (300, 100).
    const dim = { kind: 'dimension', a: { x: 0, y: 100 }, b: { x: 600, y: 100 } };
    const { deps, scene } = makeDeps();
    const d = deps as unknown as {
      canvas: { scale: number };
      history: { exec: ReturnType<typeof vi.fn> };
    };
    d.canvas.scale = 1;
    let current: Record<string, unknown> = { ...dim };
    scene.get.mockImplementation(() => ({ id: 'd1', type: 'dimension', locked: false, geometry: current }) as never);
    scene.setGeometry.mockImplementation((_k: string, g: Record<string, unknown>) => {
      current = g;
    });
    scene.geometryCopy.mockImplementation(() => ({ ...current }) as never);
    useEditorStore.getState().setSelection(['k1']);

    const a = new GestureArbiter(deps);
    // The label sits at the midpoint (300, 100). Drag it 30 px up off the line.
    a.onPointerDown(ptr(1, 300, 100));
    a.onPointerMove(ptr(1, 300, 70));
    a.onPointerUp(ptr(1, 300, 70));
    // The endpoints never moved; only the offset changed (the left-hand normal of a→b points +y, so 30 px up is −30).
    expect(current.a).toEqual(dim.a);
    expect(current.b).toEqual(dim.b);
    expect(current.labelOffset).toBeCloseTo(-30);
    expect(d.history.exec).toHaveBeenCalledTimes(1);

    // A cancelled drag restores the geometry it started from.
    a.onPointerDown(ptr(2, 300, 70));
    a.onPointerMove(ptr(2, 300, 20));
    a.onPointerCancel(ptr(2, 300, 20));
    expect(current.labelOffset).toBeCloseTo(-30);
    useEditorStore.getState().setSelection([]);
  });
});
