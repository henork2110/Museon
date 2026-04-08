import type { Shape } from '../document/model';
import type { IPoint } from '../geometry/types';
import { GEOMETRY_EPS, vertexKey } from '../geometry/types';
import { paramOnSegment, segmentIntersections, type Segment } from '../geometry/segmentOps';

export interface TaggedSegment {
  a: IPoint;
  b: IPoint;
  shapeIds: string[];
}

function mergeTags(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])].sort();
}

export function segmentsFromShapes(shapes: readonly Shape[]): TaggedSegment[] {
  const map = new Map<string, TaggedSegment>();
  for (const sh of shapes) {
    if (!sh.closed || sh.vertices.length < 2) {
      continue;
    }
    const v = sh.vertices;
    const n = v.length;
    for (let i = 0; i < n; i++) {
      const p = v[i];
      const q = v[(i + 1) % n];
      const k1 = `${vertexKey(p)}|${vertexKey(q)}`;
      const k2 = `${vertexKey(q)}|${vertexKey(p)}`;
      const key = k1 < k2 ? k1 : k2;
      const a = k1 < k2 ? p : q;
      const b = k1 < k2 ? q : p;
      const prev = map.get(key);
      if (prev) {
        map.set(key, { a, b, shapeIds: mergeTags(prev.shapeIds, [sh.id]) });
      } else {
        map.set(key, { a, b, shapeIds: [sh.id] });
      }
    }
  }
  return [...map.values()];
}

function pointAt(a: IPoint, b: IPoint, t: number): IPoint {
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

function collectParams(a: IPoint, b: IPoint, pool: TaggedSegment[]): number[] {
  const ts = new Set<number>([0, 1]);
  const seg: Segment = { a, b };
  for (const o of pool) {
    const other: Segment = { a: o.a, b: o.b };
    for (const p of segmentIntersections(seg, other)) {
      const t = paramOnSegment(a, b, p);
      if (t >= -GEOMETRY_EPS && t <= 1 + GEOMETRY_EPS) {
        const tt = Math.min(1, Math.max(0, t));
        ts.add(tt);
      }
    }
  }
  return [...ts].sort((x, y) => x - y);
}

function dedupeSegments(segs: TaggedSegment[]): TaggedSegment[] {
  const m = new Map<string, TaggedSegment>();
  for (const s of segs) {
    const k1 = `${vertexKey(s.a)}|${vertexKey(s.b)}`;
    const k2 = `${vertexKey(s.b)}|${vertexKey(s.a)}`;
    const key = k1 < k2 ? k1 : k2;
    const a = k1 < k2 ? s.a : s.b;
    const b = k1 < k2 ? s.b : s.a;
    const prev = m.get(key);
    if (prev) {
      m.set(key, { a, b, shapeIds: mergeTags(prev.shapeIds, s.shapeIds) });
    } else {
      m.set(key, { a, b, shapeIds: s.shapeIds });
    }
  }
  return [...m.values()];
}

/** Single-pass split at all pairwise intersections. */
export function splitTaggedSegments(input: TaggedSegment[]): TaggedSegment[] {
  const pool = input;
  const out: TaggedSegment[] = [];
  for (const s of pool) {
    const params = collectParams(s.a, s.b, pool);
    const uniq: number[] = [];
    for (const t of params) {
      if (!uniq.some((u) => Math.abs(u - t) < GEOMETRY_EPS)) {
        uniq.push(t);
      }
    }
    uniq.sort((x, y) => x - y);
    for (let i = 0; i < uniq.length - 1; i++) {
      const t0 = uniq[i]!;
      const t1 = uniq[i + 1]!;
      if (t1 - t0 < GEOMETRY_EPS) {
        continue;
      }
      const p0 = pointAt(s.a, s.b, t0);
      const p1 = pointAt(s.a, s.b, t1);
      if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < GEOMETRY_EPS) {
        continue;
      }
      out.push({ a: p0, b: p1, shapeIds: s.shapeIds });
    }
  }
  return dedupeSegments(out);
}
