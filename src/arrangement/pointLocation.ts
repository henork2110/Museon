/**
 * Face location uses the **arrangement** (DCEL) as the source of polygons; interior
 * tests use non-zero winding via [`pointInPolygonNonZero`](../geometry/polygon.ts)
 * (Shewchuk-style `orient2d` predicates).
 */
import type { Arrangement, Face } from './dcel';
import type { IPoint } from '../geometry/types';
import { pointInPolygonNonZero } from '../geometry/polygon';
import { pointOnPolygonBoundary } from '../geometry/predicates';

/** Smallest-area face (innermost) containing p — works for nested regions. */
export function locateFaceSmallest(p: IPoint, arrangement: Arrangement): Face | null {
  const { vertices, faces } = arrangement;
  const candidates: Face[] = [];

  for (const f of faces) {
    const loop = f.boundary.map((vi) => vertices[vi]!);
    if (pointOnPolygonBoundary(p, loop)) {
      continue;
    }
    if (pointInPolygonNonZero(p, loop)) {
      candidates.push(f);
    }
  }

  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => Math.abs(a.signedArea) - Math.abs(b.signedArea));
  return candidates[0]!;
}
