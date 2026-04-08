import type { Point, Segment, Shape } from '../model/types';
import { GEOMETRY_EPS, vertexKey } from './types';
import { paramOnSegment, segmentIntersections } from './segmentOps';

export interface TaggedSegment extends Segment {
  shapeIds: string[];
}

export function shapeToSegments(shape: Shape): TaggedSegment[] {
  const pts = shape.polygon.points;
  if (pts.length < 3) return [];
  const out: TaggedSegment[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    out.push({ a, b, shapeIds: [shape.id] });
  }
  return out;
}

export function segmentsFromShapes(shapes: readonly Shape[]): TaggedSegment[] {
  const all = shapes.flatMap(shapeToSegments);
  const merged = new Map<string, TaggedSegment>();
  for (const s of all) {
    const k1 = `${vertexKey(s.a)}|${vertexKey(s.b)}`;
    const k2 = `${vertexKey(s.b)}|${vertexKey(s.a)}`;
    const key = k1 < k2 ? k1 : k2;
    const prev = merged.get(key);
    if (prev) {
      merged.set(key, { ...prev, shapeIds: [...new Set([...prev.shapeIds, ...s.shapeIds])] });
    } else {
      merged.set(key, s);
    }
  }
  return [...merged.values()];
}

function pointAt(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function splitSegmentsAtIntersections(input: readonly TaggedSegment[]): TaggedSegment[] {
  const out: TaggedSegment[] = [];
  for (const s of input) {
    const params = new Set<number>([0, 1]);
    for (const o of input) {
      for (const p of segmentIntersections({ a: s.a, b: s.b }, { a: o.a, b: o.b })) {
        const t = Math.max(0, Math.min(1, paramOnSegment(s.a, s.b, p)));
        params.add(t);
      }
    }
    const sorted = [...params].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const t0 = sorted[i]!;
      const t1 = sorted[i + 1]!;
      if (Math.abs(t1 - t0) < GEOMETRY_EPS) continue;
      const a = pointAt(s.a, s.b, t0);
      const b = pointAt(s.a, s.b, t1);
      if (Math.hypot(a.x - b.x, a.y - b.y) < GEOMETRY_EPS) continue;
      out.push({ a, b, shapeIds: s.shapeIds });
    }
  }
  return out;
}
