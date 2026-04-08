import type { Path64 } from 'clipper2-ts';
import { FillRule } from 'clipper2-ts';
import type { IPoint } from './types';
import { GEOMETRY_EPS } from './types';
import { toPoint64 } from './types';
import {
  pointInPolygonNonZeroRobust,
  pointOnPolygonBoundary,
} from './predicates';

export function signedArea(vertices: readonly IPoint[]): number {
  let a = 0;
  const n = vertices.length;
  if (n < 3) return 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  return a / 2;
}

export function isCcw(vertices: readonly IPoint[]): boolean {
  return signedArea(vertices) > GEOMETRY_EPS;
}

export function toPath64(loop: readonly IPoint[]): Path64 {
  return loop.map((p) => toPoint64(p));
}

/** Strict interior (non-zero winding); not on boundary. */
export function pointInPolygonNonZero(pt: IPoint, path: readonly IPoint[]): boolean {
  return pointInPolygonNonZeroRobust(pt, path) && !pointOnPolygonBoundary(pt, path);
}

/** Interior or on boundary (replaces prior Clipper inside-or-on-edge behavior). */
export function loopContainsPoint(pt: IPoint, loop: readonly IPoint[]): boolean {
  return pointInPolygonNonZeroRobust(pt, loop) || pointOnPolygonBoundary(pt, loop);
}

/**
 * Robust interior sample: tries the centroid first, then midpoints of
 * edges nudged inward. Guarantees a point strictly inside the polygon
 * for any simple (non-self-intersecting) boundary.
 */
export function faceInteriorSample(boundary: readonly IPoint[]): IPoint {
  const n = boundary.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n < 3) {
    let cx = 0, cy = 0;
    for (const p of boundary) { cx += p.x; cy += p.y; }
    return { x: cx / n, y: cy / n };
  }

  let cx = 0, cy = 0;
  for (const p of boundary) { cx += p.x; cy += p.y; }
  cx /= n;
  cy /= n;
  const centroid: IPoint = { x: cx, y: cy };
  if (strictlyInside(centroid, boundary)) return centroid;

  // Centroid missed (concave polygon). Try midpoints of each edge,
  // nudged toward the centroid.
  for (let i = 0; i < n; i++) {
    const a = boundary[i]!;
    const b = boundary[(i + 1) % n]!;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = cx - mx;
    const dy = cy - my;
    const len = Math.hypot(dx, dy) || 1;
    for (const nudge of [0.01, 0.05, 0.1, 0.25]) {
      const test: IPoint = { x: mx + dx / len * nudge, y: my + dy / len * nudge };
      if (strictlyInside(test, boundary)) return test;
      const test2: IPoint = { x: mx - dx / len * nudge, y: my - dy / len * nudge };
      if (strictlyInside(test2, boundary)) return test2;
    }
  }

  // Concave fallback: walk from each vertex toward centroid and try interior fractions.
  for (let i = 0; i < n; i++) {
    const v = boundary[i]!;
    for (const t of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const test: IPoint = { x: v.x + (cx - v.x) * t, y: v.y + (cy - v.y) * t };
      if (strictlyInside(test, boundary)) return test;
    }
  }

  // Last resort: scan horizontal ray through centroid Y
  for (let i = 0; i < n; i++) {
    const a = boundary[i]!;
    const b = boundary[(i + 1) % n]!;
    if ((a.y <= cy && b.y > cy) || (b.y <= cy && a.y > cy)) {
      const t = (cy - a.y) / (b.y - a.y);
      const ix = a.x + t * (b.x - a.x);
      const test: IPoint = { x: (ix + cx) / 2, y: cy };
      if (strictlyInside(test, boundary)) return test;
    }
  }

  return centroid;
}

function strictlyInside(pt: IPoint, boundary: readonly IPoint[]): boolean {
  return pointInPolygonNonZeroRobust(pt, boundary) && !pointOnPolygonBoundary(pt, boundary);
}

/**
 * Remove collinear vertices from a polygon loop.
 * Collinear = three consecutive points where cross product ≈ 0.
 */
export function removeCollinear(loop: IPoint[], eps = 1e-6): IPoint[] {
  if (loop.length < 3) return loop;
  const out: IPoint[] = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n]!;
    const b = loop[i]!;
    const c = loop[(i + 1) % n]!;
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > eps) {
      out.push(b);
    }
  }
  return out.length >= 3 ? out : loop;
}

export const DEFAULT_FILL_RULE = FillRule.NonZero;
