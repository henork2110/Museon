/**
 * **Arrangement (DCEL)** is the source of truth for face regions and topology.
 * Booleans use Clipper2; robust orientation tests use [`../geometry/predicates`](../geometry/predicates.ts).
 */
import type { Shape } from '../document/model';
import { buildArrangement, type Arrangement } from './dcel';
import { computeFaceCoveragesWithVertices, type FaceCoverage } from './coverage';
import { segmentsFromShapes, splitTaggedSegments } from './splitSegments';

export type { Arrangement, Face, HalfEdge } from './dcel';
export type { FaceCoverage } from './coverage';
export { segmentsFromShapes, splitTaggedSegments } from './splitSegments';
export { buildArrangement } from './dcel';
export { computeFaceCoveragesWithVertices } from './coverage';
export { locateFaceSmallest } from './pointLocation';

export function buildArrangementFromShapes(shapes: Shape[]): {
  arrangement: Arrangement;
  coverages: FaceCoverage[];
} {
  const raw = segmentsFromShapes(shapes);
  const split = splitTaggedSegments(raw);
  const arrangement = buildArrangement(split);
  const coverages = computeFaceCoveragesWithVertices(
    arrangement.faces,
    (i) => arrangement.vertices[i]!,
    shapes,
  );
  return { arrangement, coverages };
}
