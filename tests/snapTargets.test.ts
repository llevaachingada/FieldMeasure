import { describe, expect, it } from 'vitest';
import { collectSnapTargets, loupeOverlayFor } from '../src/editor/snapTargets';
import { DEFAULT_STYLE, type Annotation } from '../src/domain/types';

const ann = (id: string, geometry: Annotation['geometry'], extra: Partial<Annotation> = {}): Annotation =>
  ({ id, type: geometry.kind, geometry, style: DEFAULT_STYLE, zIndex: 0, ...extra }) as unknown as Annotation;

describe('D161 — snap targets', () => {
  const list = [
    ann('d', { kind: 'dimension', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }),
    ann('r', { kind: 'rect', x: 20, y: 20, width: 5, height: 5 }),
    ann('g', { kind: 'angle', a: { x: 1, y: 1 }, vertex: { x: 2, y: 2 }, c: { x: 3, y: 1 } }),
    ann('h', { kind: 'line', a: { x: 50, y: 50 }, b: { x: 60, y: 60 } }, { visible: false }),
    ann('t', { kind: 'text', at: { x: 9, y: 9 }, text: 'x', background: 'box' }),
  ];

  it('collects ends, corners and vertices of visible marks, skipping the excluded one', () => {
    const all = collectSnapTargets(list).map((t) => t.p);
    expect(all).toHaveLength(2 + 4 + 3);
    expect(all).not.toContainEqual({ x: 50, y: 50 }); // hidden
    expect(collectSnapTargets(list, 'd').map((t) => t.p)).not.toContainEqual({ x: 0, y: 0 });
  });

  it('the loupe overlay draws every visible mark as a path', () => {
    const o = loupeOverlayFor(list);
    expect(o.paths.map((p) => p.points.length)).toEqual([2, 4, 3]);
    expect(o.paths[1].closed).toBe(true);
  });
});
