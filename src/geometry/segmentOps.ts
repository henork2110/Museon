import type { IPoint } from './types';
import { GEOMETRY_EPS } from './types';
import { orient2d } from './predicates';
import { cross, dot, sub } from './vec';

export interface Segment {
  readonly a: IPoint;
  readonly b: IPoint;
}

function pushUnique(out: IPoint[], pt: IPoint) {
  if (!out.some((o) => Math.hypot(o.x - pt.x, o.y - pt.y) < GEOMETRY_EPS)) {
    out.push(pt);
  }
}

/** Intersection points between closed segments (including endpoints on the other segment). */
export function segmentIntersections(s1: Segment, s2: Segment): IPoint[] {
  const { a: p1, b: p2 } = s1;
  const { a: p3, b: p4 } = s2;
  const r = sub(p2, p1);
  const svec = sub(p4, p3);
  const denom = cross(r.x, r.y, svec.x, svec.y);

  const out: IPoint[] = [];

  // Parallel: collinear overlap uses projection; distinct parallel lines → no intersection.
  if (Math.abs(denom) < GEOMETRY_EPS) {
    const oC = orient2d(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    const oD = orient2d(p1.x, p1.y, p2.x, p2.y, p4.x, p4.y);
    if (Math.abs(oC) > 1e-12 || Math.abs(oD) > 1e-12) {
      return out;
    }
    const r2 = dot(r.x, r.y, r.x, r.y);
    if (r2 < GEOMETRY_EPS * GEOMETRY_EPS) {
      return out;
    }
    const t3 = dot(sub(p3, p1).x, sub(p3, p1).y, r.x, r.y) / r2;
    const t4 = dot(sub(p4, p1).x, sub(p4, p1).y, r.x, r.y) / r2;
    const lo = Math.max(0, Math.min(t3, t4, 1));
    const hi = Math.min(1, Math.max(t3, t4, 0));
    if (lo > hi + GEOMETRY_EPS) {
      return out;
    }
    pushUnique(out, { x: p1.x + lo * r.x, y: p1.y + lo * r.y });
    pushUnique(out, { x: p1.x + hi * r.x, y: p1.y + hi * r.y });
    return out;
  }

  const t = cross(sub(p3, p1).x, sub(p3, p1).y, svec.x, svec.y) / denom;
  const u = cross(sub(p3, p1).x, sub(p3, p1).y, r.x, r.y) / denom;

  if (t >= -GEOMETRY_EPS && t <= 1 + GEOMETRY_EPS && u >= -GEOMETRY_EPS && u <= 1 + GEOMETRY_EPS) {
    const tt = Math.min(1, Math.max(0, t));
    pushUnique(out, { x: p1.x + tt * r.x, y: p1.y + tt * r.y });
  }

  return out;
}

export function paramOnSegment(a: IPoint, b: IPoint, p: IPoint): number {
  const r = sub(b, a);
  const r2 = dot(r.x, r.y, r.x, r.y);
  if (r2 < GEOMETRY_EPS * GEOMETRY_EPS) {
    return 0;
  }
  return dot(p.x - a.x, p.y - a.y, r.x, r.y) / r2;
}

export function pointOnSegment(a: IPoint, b: IPoint, p: IPoint, eps = GEOMETRY_EPS): boolean {
  const t = paramOnSegment(a, b, p);
  if (t < -eps || t > 1 + eps) {
    return false;
  }
  const proj = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  return Math.hypot(p.x - proj.x, p.y - proj.y) < eps;
}
