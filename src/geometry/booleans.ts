import {
  Clipper,
  ClipType,
  FillRule,
  type Path64,
  type Paths64,
} from 'clipper2-ts';
import type { Point, Polygon } from '../model/types';

export type BooleanOp = 'union' | 'subtract' | 'intersect' | 'xor';

export function toPath64(points: readonly Point[]): Path64 {
  return points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

export function fromPath64(path: Path64): Polygon {
  return { points: path.map((p) => ({ x: p.x, y: p.y })) };
}

export function polygonsToPaths(polygons: readonly Polygon[]): Paths64 {
  return polygons.filter((p) => p.points.length >= 3).map((p) => toPath64(p.points));
}

export function pathsToPolygons(paths: Paths64): Polygon[] {
  return paths.filter((p) => p.length >= 3).map(fromPath64);
}

export function booleanOp(
  op: BooleanOp,
  subject: readonly Polygon[],
  clip: readonly Polygon[] = [],
  fillRule: FillRule = FillRule.NonZero,
): Polygon[] {
  const s = polygonsToPaths(subject);
  const c = polygonsToPaths(clip);
  if (op === 'union' && c.length === 0) {
    return pathsToPolygons(Clipper.union(s, fillRule));
  }
  if (op === 'union') {
    return pathsToPolygons(Clipper.union(s, c, fillRule));
  }
  const ct =
    op === 'subtract'
      ? ClipType.Difference
      : op === 'intersect'
        ? ClipType.Intersection
        : ClipType.Xor;
  return pathsToPolygons(Clipper.booleanOp(ct, s, c, fillRule));
}

export function areaOfPolygons(polygons: readonly Polygon[]): number {
  return Math.abs(Clipper.areaPaths(polygonsToPaths(polygons)));
}
