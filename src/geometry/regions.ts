import { buildArrangementFromShapes } from '../arrangement';
import type { Shape as LegacyShape } from '../document/model';
import type { Point, Polygon, Shape } from '../model/types';
import { pointInPolygonNonZero } from './polygon';

export interface Region {
  id: number;
  polygon: Polygon;
  coveringShapeIds: string[];
  topShapeId: string | null;
  topZ: number | null;
}

function toLegacyShape(shape: Shape): LegacyShape {
  return {
    id: shape.id,
    zIndex: shape.zIndex,
    closed: true,
    vertices: shape.polygon.points,
  };
}

export function detectRegions(shapes: readonly Shape[]): Region[] {
  const legacy = shapes.map(toLegacyShape);
  const { arrangement, coverages } = buildArrangementFromShapes(legacy);
  const byFace = new Map<number, (typeof coverages)[number]>();
  for (const c of coverages) byFace.set(c.faceId, c);
  const zById = new Map(shapes.map((s) => [s.id, s.zIndex]));
  return arrangement.faces
    .filter((f) => f.signedArea > 1e-9)
    .map((f) => {
      const cov = byFace.get(f.id);
      const coveringShapeIds = cov?.coveringIdsBottomToTop ?? [];
      const topShapeId = cov?.topId ?? null;
      const topZ = topShapeId == null ? null : (zById.get(topShapeId) ?? null);
      return {
        id: f.id,
        polygon: { points: f.boundary.map((i) => arrangement.vertices[i] as Point) },
        coveringShapeIds,
        topShapeId,
        topZ,
      };
    });
}

export function locateRegionSmallest(p: Point, regions: readonly Region[]): Region | null {
  const inside = regions.filter((r) => pointInPolygonNonZero(p, r.polygon.points));
  if (inside.length === 0) return null;
  inside.sort((a, b) => Math.abs(area(a.polygon.points)) - Math.abs(area(b.polygon.points)));
  return inside[0]!;
}

function area(loop: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const j = (i + 1) % loop.length;
    a += loop[i]!.x * loop[j]!.y - loop[j]!.x * loop[i]!.y;
  }
  return a / 2;
}
