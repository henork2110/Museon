import type { Point } from '../model/types';
import { vertexKey } from './types';
import type { TaggedSegment } from './intersection';

export interface PlanarGraphEdge {
  a: number;
  b: number;
  shapeIds: string[];
}

export interface PlanarGraph {
  vertices: Point[];
  edges: PlanarGraphEdge[];
  byVertex: Map<number, number[]>;
}

export function buildPlanarGraph(segments: readonly TaggedSegment[]): PlanarGraph {
  const vertices: Point[] = [];
  const vMap = new Map<string, number>();
  const edges: PlanarGraphEdge[] = [];
  const edgeSeen = new Set<string>();

  const indexOf = (p: Point): number => {
    const key = vertexKey(p);
    const prev = vMap.get(key);
    if (prev != null) return prev;
    const i = vertices.length;
    vertices.push({ x: p.x, y: p.y });
    vMap.set(key, i);
    return i;
  };

  for (const s of segments) {
    const a = indexOf(s.a);
    const b = indexOf(s.b);
    if (a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (edgeSeen.has(key)) continue;
    edgeSeen.add(key);
    edges.push({ a, b, shapeIds: s.shapeIds });
  }

  const byVertex = new Map<number, number[]>();
  edges.forEach((e, i) => {
    byVertex.set(e.a, [...(byVertex.get(e.a) ?? []), i]);
    byVertex.set(e.b, [...(byVertex.get(e.b) ?? []), i]);
  });

  return { vertices, edges, byVertex };
}
