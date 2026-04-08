import type { Shape } from '../document/model';
import { sortedShapesByZ } from '../document/model';
import type { Face } from './dcel';
import type { IPoint } from '../geometry/types';
import { faceInteriorSample, pointInPolygonNonZero } from '../geometry/polygon';

export interface FaceCoverage {
  faceId: number;
  coveringIdsBottomToTop: string[];
  topId: string | null;
  sample: IPoint;
}

export function computeFaceCoveragesWithVertices(
  faces: Face[],
  getVertex: (i: number) => IPoint,
  shapes: Shape[],
): FaceCoverage[] {
  const ordered = sortedShapesByZ({ shapes, nextZ: 0 });
  const result: FaceCoverage[] = [];

  for (const f of faces) {
    const loop = f.boundary.map((vi) => getVertex(vi));
    const sample = faceInteriorSample(loop);
    const covering: string[] = [];
    const strictInside: string[] = [];
    for (const sh of ordered) {
      if (!sh.closed || sh.vertices.length < 3) continue;
      if (pointInPolygonNonZero(sample, sh.vertices)) {
        strictInside.push(sh.id);
        covering.push(sh.id);
      }
    }
    const topId = strictInside.length ? strictInside[strictInside.length - 1]! : null;
    result.push({
      faceId: f.id,
      coveringIdsBottomToTop: covering,
      topId,
      sample,
    });
  }

  return result;
}
