/**
 * D161 (owner, session 29): a selected dimension / line / arrow is edited by its two END grips
 * (MyMeasures-style), the dragged end keeps the finger's grab offset, snaps to other marks'
 * ends and corners (never its own), shows the loupe with the marks drawn in it, and the whole
 * drag is ONE undo step. A selected text box has no size handles.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { EditorCanvas } from '../src/editor/EditorCanvas';
import { MarkupScene } from '../src/editor/shapes/scene';
import { History } from '../src/editor/history';
import { Loupe } from '../src/editor/Loupe';
import { SelectTool } from '../src/editor/tools/SelectTool';
import { loupeOverlayFor } from '../src/editor/snapTargets';
import { DEFAULT_STYLE } from '../src/domain/types';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function makeRig() {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:0;top:0;width:900px;height:900px';
  document.body.appendChild(host);
  const canvas = new EditorCanvas(host, { markupPixelRatio: () => 1 });
  const scene = new MarkupScene({
    layer: canvas.markupLayer,
    ctx: { unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 },
    ghostText: 'tap to enter value',
  });
  const overlays: unknown[] = [];
  const loupe = new Loupe({
    layer: canvas.overlayLayer,
    getImage: () => null,
    getScale: () => canvas.scale,
    screenToImage: (p) => canvas.screenToImage(p),
    getViewport: () => ({ width: 900, height: 900 }),
    getHandedness: () => 'right',
    getOverlay: (exclude) => {
      const o = loupeOverlayFor(scene.list(), exclude);
      overlays.push(o);
      return o;
    },
  });
  cleanups.push(() => {
    loupe.destroy();
    scene.load([]);
    canvas.destroy();
    host.remove();
  });
  const history = new History();
  const selection: string[] = [];
  const tool = new SelectTool({
    canvas,
    scene,
    history,
    getSelection: () => selection,
    setSelection: (keys) => selection.splice(0, selection.length, ...keys),
    onSelectionChange: () => {},
    onPinnedToolbar: () => {},
    labels: { move: 'Move', rotate: 'Rotate', delete: 'Delete', locked: 'Locked' },
    loupe,
  });
  return { canvas, scene, history, tool, selection, loupe, overlays };
}

describe('D161 — end grips', () => {
  it('shows two end grips (not box handles) for a selected dimension', () => {
    const rig = makeRig();
    const d = rig.scene.addDimension({ x: 100, y: 100 }, { x: 400, y: 100 });
    rig.selection.push(d.id);
    rig.tool.refresh();
    expect(rig.tool.hitHandleAt({ x: 100, y: 100 }, 'touch')).toBe('a');
    expect(rig.tool.hitHandleAt({ x: 400, y: 100 }, 'touch')).toBe('b');
    expect(rig.tool.hitHandleAt({ x: 250, y: 60 }, 'touch')).toBeNull(); // no box handles
  });

  it('drags an end WITH the finger, snaps to another mark end, shows the loupe, one undo step', () => {
    const rig = makeRig();
    const d = rig.scene.addDimension({ x: 100, y: 100 }, { x: 400, y: 100 });
    rig.scene.addMarkup({ type: 'line', geometry: { kind: 'line', a: { x: 500, y: 300 }, b: { x: 700, y: 300 } }, style: DEFAULT_STYLE });
    rig.selection.push(d.id);
    rig.tool.refresh();

    // Grab B 10 px off (the finger never sits exactly on the point).
    expect(rig.tool.onPointerDown({ x: 410, y: 105 }, 'touch')).toBe('consume');
    expect(rig.loupe.isVisible).toBe(true);
    // Move the finger so B lands 6 px from the line's end (500,300): it snaps exactly there.
    rig.tool.onPointerMove({ x: 410 + 94, y: 105 + 203 }, true);
    expect(rig.scene.geometryAt(d.id)!.b).toEqual({ x: 500, y: 300 });
    // The loupe drew the marks, and the dragged dimension's own ends are NOT snap targets.
    const last = rig.overlays.at(-1) as ReturnType<typeof loupeOverlayFor>;
    expect(last.paths.length).toBe(2);
    expect(last.targets).toContainEqual({ x: 500, y: 300 });
    expect(last.targets).not.toContainEqual({ x: 100, y: 100 });

    rig.tool.onPointerUp({ x: 504, y: 308 }, false, 'touch');
    expect(rig.history.depth).toBe(1);
    rig.history.undo();
    expect(rig.scene.geometryAt(d.id)!.b).toEqual({ x: 400, y: 100 });
  });

  it('a free drag (nothing near) moves the end by exactly the finger delta', () => {
    const rig = makeRig();
    const d = rig.scene.addDimension({ x: 100, y: 100 }, { x: 400, y: 100 });
    rig.selection.push(d.id);
    rig.tool.refresh();
    rig.tool.onPointerDown({ x: 95, y: 98 }, 'touch');
    rig.tool.onPointerMove({ x: 95 + 37, y: 98 + 150 }, true);
    rig.tool.onPointerUp({ x: 132, y: 248 }, false, 'touch');
    expect(rig.scene.geometryAt(d.id)!.a).toEqual({ x: 137, y: 250 });
  });

  it('a selected text box has no handles (drag moves it, a second tap edits it)', () => {
    const rig = makeRig();
    const t = rig.scene.addMarkup({
      type: 'text',
      geometry: { kind: 'text', at: { x: 200, y: 200 }, text: 'Kitchen', background: 'box' },
      style: DEFAULT_STYLE,
    });
    rig.selection.push(t.id);
    rig.tool.refresh();
    expect(rig.tool.hitHandleAt({ x: 200, y: 200 }, 'touch')).toBeNull();
  });
});
