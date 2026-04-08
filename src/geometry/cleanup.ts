import type { Point, Polygon } from '../model/types';

export function removeRedundantPoints(polygon: Polygon, eps = 1e-9): Polygon {
  const loop = polygon.points;
  if (loop.length < 3) return polygon;
  const out: Point[] = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n]!;
    const b = loop[i]!;
    const c = loop[(i + 1) % n]!;
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const collinear = Math.abs(cross) < eps;
    if (!collinear) out.push(b);
  }
  return { points: out.length >= 3 ? out : [...loop] };
}
