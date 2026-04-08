/**
 * Predicate helpers.
 *
 * We keep orientation and winding checks centralized so all intersection and
 * region logic uses one consistent numeric policy.
 */
import type { IPoint } from './types';
import { GEOMETRY_EPS } from './types';

export function orient2d(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

export function orient2dPoints(a: IPoint, b: IPoint, c: IPoint): number {
  return orient2d(a.x, a.y, b.x, b.y, c.x, c.y);
}

/** `orient2d` magnitude below this is treated as collinear for boundary tests. */
const COLLINEAR_ABS_TOL = 1e-12;

/**
 * Non-zero winding rule: point strictly inside a simple closed polygon.
 * `loop` is an open ring (first vertex not repeated at the end).
 */
export function pointInPolygonNonZeroRobust(pt: IPoint, loop: readonly IPoint[]): boolean {
  if (loop.length < 3) return false;
  let wn = 0;
  const { x: px, y: py } = pt;
  for (let i = 0, n = loop.length; i < n; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % n]!;
    if (a.y <= py) {
      if (b.y > py && orient2d(a.x, a.y, b.x, b.y, px, py) > 0) wn++;
    } else {
      if (b.y <= py && orient2d(a.x, a.y, b.x, b.y, px, py) < 0) wn--;
    }
  }
  return wn !== 0;
}

/** True if `pt` lies on some edge of the closed polygon (collinear and between endpoints). */
export function pointOnPolygonBoundary(pt: IPoint, loop: readonly IPoint[]): boolean {
  const n = loop.length;
  if (n < 2) return false;
  for (let i = 0; i < n; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % n]!;
    if (Math.abs(orient2d(a.x, a.y, b.x, b.y, pt.x, pt.y)) > COLLINEAR_ABS_TOL) {
      continue;
    }
    const minx = Math.min(a.x, b.x);
    const maxx = Math.max(a.x, b.x);
    const miny = Math.min(a.y, b.y);
    const maxy = Math.max(a.y, b.y);
    if (pt.x < minx - GEOMETRY_EPS || pt.x > maxx + GEOMETRY_EPS) continue;
    if (pt.y < miny - GEOMETRY_EPS || pt.y > maxy + GEOMETRY_EPS) continue;
    return true;
  }
  return false;
}
