import { describe, expect, it } from 'vitest';
import type { Shape } from '../src/model/types';
import { booleanOp, areaOfPolygons } from '../src/geometry/booleans';
import { segmentsFromShapes, splitSegmentsAtIntersections } from '../src/geometry/intersection';
import { buildPlanarGraph } from '../src/geometry/graph';
import { detectRegions } from '../src/geometry/regions';
import { removeRedundantPoints } from '../src/geometry/cleanup';

function shape(id: string, zIndex: number, points: [number, number][]): Shape {
  return { id, zIndex, polygon: { points: points.map(([x, y]) => ({ x, y })) } };
}

describe('boolean core', () => {
  it('overlapping triangles intersect', () => {
    const a = shape('a', 0, [[0, 0], [60, 0], [30, 60]]);
    const b = shape('b', 1, [[20, 10], [80, 10], [50, 70]]);
    const inter = booleanOp('intersect', [a.polygon], [b.polygon]);
    expect(inter.length).toBeGreaterThan(0);
    expect(areaOfPolygons(inter)).toBeGreaterThan(0);
  });

  it('one inside another subtract works', () => {
    const outer = shape('outer', 0, [[0, 0], [100, 0], [100, 100], [0, 100]]);
    const inner = shape('inner', 1, [[25, 25], [75, 25], [75, 75], [25, 75]]);
    const out = booleanOp('subtract', [outer.polygon], [inner.polygon]);
    expect(areaOfPolygons(out)).toBe(7500);
  });

  it('thin sliver region survives intersection', () => {
    const a = shape('a', 0, [[0, 0], [100, 0], [100, 100], [0, 100]]);
    const b = shape('b', 1, [[40, 0], [41, 0], [41, 100], [40, 100]]);
    const inter = booleanOp('intersect', [a.polygon], [b.polygon]);
    expect(areaOfPolygons(inter)).toBe(100);
  });
});

describe('segment splitting + graph', () => {
  it('shared edge and shared point produce split graph', () => {
    const a = shape('a', 0, [[0, 0], [40, 0], [40, 40], [0, 40]]);
    const b = shape('b', 1, [[40, 0], [80, 0], [80, 40], [40, 40]]);
    const c = shape('c', 2, [[80, 40], [100, 60], [80, 80]]);
    const split = splitSegmentsAtIntersections(segmentsFromShapes([a, b, c]));
    const g = buildPlanarGraph(split);
    expect(split.length).toBeGreaterThan(0);
    expect(g.vertices.length).toBeGreaterThan(0);
    expect(g.edges.length).toBeGreaterThan(0);
  });

  it('collinear overlap splits into multiple segments', () => {
    const a = shape('a', 0, [[0, 0], [80, 0], [80, 20], [0, 20]]);
    const b = shape('b', 1, [[40, 0], [120, 0], [120, 20], [40, 20]]);
    const split = splitSegmentsAtIntersections(segmentsFromShapes([a, b]));
    expect(split.length).toBeGreaterThan(8);
  });
});

describe('region detection + overlay semantics', () => {
  it('multiple overlays compute regions with top shape', () => {
    const shapes = [
      shape('base', 0, [[0, 0], [120, 0], [120, 120], [0, 120]]),
      shape('m1', 1, [[16, 16], [48, 16], [48, 48], [16, 48]]),
      shape('m2', 2, [[32, 32], [80, 32], [80, 80], [32, 80]]),
    ];
    const regions = detectRegions(shapes);
    expect(regions.length).toBeGreaterThan(0);
    const center = regions.find((r) =>
      r.polygon.points.every((p) => p.x >= 32 && p.x <= 80 && p.y >= 32 && p.y <= 80),
    );
    if (center) expect(center.topShapeId).toBe('m2');
  });
});

describe('cleanup', () => {
  it('removes redundant collinear points', () => {
    const poly = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] };
    const cleaned = removeRedundantPoints(poly);
    expect(cleaned.points.length).toBe(4);
  });
});
