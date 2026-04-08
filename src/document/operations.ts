import type { Paths64 } from 'clipper2-ts';
import { FillRule } from 'clipper2-ts';
import type { Shape } from './model';
import { addShape, ensureCCW, type DocumentModel } from './model';
import type { Arrangement, Face } from '../arrangement/dcel';
import type { FaceCoverage } from '../arrangement/coverage';
import type { IPoint } from '../geometry/types';
import { quantizeToGrid } from '../geometry/types';
import { removeCollinear, signedArea, toPath64 } from '../geometry/polygon';
import { ClipperBooleanEngine } from '../booleans/clipperAdapter';

const engine = new ClipperBooleanEngine(FillRule.NonZero);

export const SLIVER_AREA = 1e-6;
export const MIN_OVERLAP_AREA = 0.5;
export const MIN_POSITIVE_ARRANGEMENT_FACE_AREA = 1e-6;

function faceToPath64(vertices: readonly IPoint[], face: Face): Paths64 {
  const loop = face.boundary.map((i) => vertices[i]!);
  if (loop.length < 3) return [];
  return [toPath64(loop)];
}

function dedupeConsecutive(pts: IPoint[]): IPoint[] {
  if (pts.length < 2) return pts;
  const out: IPoint[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1]!;
    if (Math.abs(pts[i]!.x - prev.x) > 0.01 || Math.abs(pts[i]!.y - prev.y) > 0.01) {
      out.push(pts[i]!);
    }
  }
  if (out.length > 1) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.abs(first.x - last.x) <= 0.01 && Math.abs(first.y - last.y) <= 0.01) {
      out.pop();
    }
  }
  return out;
}

function pathsToShapeVertices(paths: Paths64): IPoint[][] {
  return paths
    .map((p) => {
      const pts = p.map((pt) => ({ x: pt.x, y: pt.y }));
      const snapped = pts.map((q) => quantizeToGrid(q.x, q.y, 1));
      const deduped = dedupeConsecutive(snapped);
      const cleaned = removeCollinear(deduped);
      return ensureCCW(cleaned);
    })
    .filter((loop) => loop.length >= 3 && signedArea(loop) > SLIVER_AREA);
}

export function getBaseShape(doc: DocumentModel): Shape | null {
  if (doc.shapes.length === 0) return null;
  return [...doc.shapes].sort((a, b) => a.zIndex - b.zIndex)[0]!;
}

export function mergeFacesIntoShape(
  doc: DocumentModel,
  arrangementVertices: readonly IPoint[],
  faces: Face[],
): DocumentModel {
  if (faces.length === 0) return doc;
  const paths: Paths64 = [];
  for (const f of faces) paths.push(...faceToPath64(arrangementVertices, f));
  const merged = engine.unionOne(paths);
  let next = doc;
  for (const loop of pathsToShapeVertices(merged)) {
    if (loop.length >= 3) next = addShape(next, loop, true);
  }
  return next;
}

export function subtractFaceFromBase(
  doc: DocumentModel,
  arrangementVertices: readonly IPoint[],
  face: Face,
): DocumentModel {
  const base = getBaseShape(doc);
  if (!base || base.vertices.length < 3) return doc;
  const basePaths: Paths64 = [toPath64(base.vertices)];
  const cutter = faceToPath64(arrangementVertices, face);
  if (cutter.length === 0) return doc;
  const result = engine.unionOne(engine.execute('subtract', basePaths, cutter));
  const others = doc.shapes.filter((s) => s.id !== base.id);
  let next: DocumentModel = { shapes: others, nextZ: doc.nextZ };
  for (const loop of pathsToShapeVertices(result)) {
    if (loop.length >= 3) next = addShape(next, loop, true);
  }
  return next;
}

/**
 * Delete arrangement faces by subtracting the deleted region from ALL shapes
 * that cover it (not just the topmost).  Uses `coveringIdsBottomToTop` from
 * coverage data so that deleting a face cuts through every overlapping shape.
 */
export function deleteRegionsFromDocument(
  doc: DocumentModel,
  arrangement: Arrangement,
  coverages: FaceCoverage[],
  deletedFaces: Face[],
): DocumentModel {
  if (deletedFaces.length === 0) return doc;

  const deletedIds = new Set(deletedFaces.map((f) => f.id));
  const verts = arrangement.vertices;
  const allFaces = arrangement.faces;

  const faceById = new Map<number, Face>();
  for (const f of allFaces) faceById.set(f.id, f);

  // Build map: shapeId -> all face ids where that shape is a covering shape
  const shapeToFaces = new Map<string, number[]>();
  for (const cov of coverages) {
    const face = faceById.get(cov.faceId);
    if (!face || face.signedArea <= MIN_POSITIVE_ARRANGEMENT_FACE_AREA) continue;
    // Add this face to ALL covering shapes, not just topId
    for (const shapeId of cov.coveringIdsBottomToTop) {
      let list = shapeToFaces.get(shapeId);
      if (!list) {
        list = [];
        shapeToFaces.set(shapeId, list);
      }
      list.push(cov.faceId);
    }
  }

  // Build the cutter polygon from deleted faces (union them)
  const cutterPaths: Paths64 = [];
  for (const f of deletedFaces) {
    cutterPaths.push(...faceToPath64(verts, f));
  }
  const cutterUnion = engine.unionOne(cutterPaths);

  const newShapes: Shape[] = [];
  let maxZ = -1;

  for (const sh of doc.shapes) {
    if (!sh.closed || sh.vertices.length < 3) {
      newShapes.push(sh);
      maxZ = Math.max(maxZ, sh.zIndex);
      continue;
    }

    const ownedFaceIds = shapeToFaces.get(sh.id);
    if (!ownedFaceIds || !ownedFaceIds.some((fid) => deletedIds.has(fid))) {
      // Shape doesn't cover any deleted face — keep as is
      newShapes.push(sh);
      maxZ = Math.max(maxZ, sh.zIndex);
      continue;
    }

    // Subtract the cutter from this shape's original polygon
    const basePaths: Paths64 = [toPath64(sh.vertices)];
    const result = engine.execute('subtract', basePaths, cutterUnion);
    const rebuilt = engine.unionOne(result);
    const outLoops = pathsToShapeVertices(rebuilt);

    if (outLoops.length === 0) {
      // Shape entirely consumed — drop it.
      maxZ = Math.max(maxZ, sh.zIndex);
      continue;
    }

    for (let i = 0; i < outLoops.length; i++) {
      const loop = outLoops[i]!;
      if (loop.length >= 3) {
        const keepIdentity = i === 0;
        const z = keepIdentity ? sh.zIndex : maxZ + 1;
        if (!keepIdentity) maxZ = z;
        newShapes.push({
          id: keepIdentity ? sh.id : `${sh.id}_part_${z}`,
          zIndex: z,
          closed: true,
          vertices: loop,
        });
      }
    }
  }

  return { shapes: newShapes, nextZ: maxZ + 1 };
}

export function addFaceAsShape(
  doc: DocumentModel,
  arrangementVertices: readonly IPoint[],
  face: Face,
): DocumentModel {
  const paths = faceToPath64(arrangementVertices, face);
  if (paths.length === 0) return doc;
  const loops = pathsToShapeVertices(paths);
  let next = doc;
  for (const l of loops) {
    if (l.length >= 3) next = addShape(next, l, true);
  }
  return next;
}

/**
 * Merge selected arrangement faces into a single new shape.
 *
 * For each source shape that has ALL its faces selected, the shape is removed
 * entirely (consumed). For shapes that are only partially selected, they are
 * rebuilt from their remaining (non-selected) faces. The selected faces are
 * unioned into a new shape added to the document.
 */
export function mergeSelectedFacesIntoShape(
  doc: DocumentModel,
  arrangement: Arrangement,
  coverages: FaceCoverage[],
  selectedFaces: Face[],
): DocumentModel {
  if (selectedFaces.length === 0) return doc;

  const selectedIds = new Set(selectedFaces.map((f) => f.id));
  const verts = arrangement.vertices;
  const allFaces = arrangement.faces;

  const faceById = new Map<number, Face>();
  for (const f of allFaces) faceById.set(f.id, f);

  // Build map: shapeId -> list of face ids owned by that shape
  const shapeToFaces = new Map<string, number[]>();
  for (const cov of coverages) {
    const face = faceById.get(cov.faceId);
    if (!face || face.signedArea <= MIN_POSITIVE_ARRANGEMENT_FACE_AREA) continue;
    const shapeId = cov.topId;
    if (shapeId == null) continue;
    let list = shapeToFaces.get(shapeId);
    if (!list) {
      list = [];
      shapeToFaces.set(shapeId, list);
    }
    list.push(cov.faceId);
  }

  // 1) Union selected face polygons into new shape
  const selectedPaths: Paths64 = [];
  for (const f of selectedFaces) {
    selectedPaths.push(...faceToPath64(verts, f));
  }
  const mergedPaths = engine.unionOne(selectedPaths);
  const mergedLoops = pathsToShapeVertices(mergedPaths);

  // 2) Rebuild affected source shapes (remove selected faces from them)
  const newShapes: Shape[] = [];
  let maxZ = -1;

  for (const sh of doc.shapes) {
    if (!sh.closed || sh.vertices.length < 3) {
      newShapes.push(sh);
      maxZ = Math.max(maxZ, sh.zIndex);
      continue;
    }

    const ownedFaceIds = shapeToFaces.get(sh.id);
    if (!ownedFaceIds || !ownedFaceIds.some((fid) => selectedIds.has(fid))) {
      // Shape not affected by selection
      newShapes.push(sh);
      maxZ = Math.max(maxZ, sh.zIndex);
      continue;
    }

    // Check if ALL faces are selected (shape fully consumed)
    const allSelected = ownedFaceIds.every((fid) => selectedIds.has(fid));
    if (allSelected) {
      // Shape fully consumed - don't add it back
      maxZ = Math.max(maxZ, sh.zIndex);
      continue;
    }

    // Partially consumed - rebuild from remaining faces
    const remainingPaths: Paths64 = [];
    for (const fid of ownedFaceIds) {
      if (selectedIds.has(fid)) continue;
      const face = faceById.get(fid);
      if (face) remainingPaths.push(...faceToPath64(verts, face));
    }

    if (remainingPaths.length === 0) {
      maxZ = Math.max(maxZ, sh.zIndex);
      continue;
    }

    const rebuilt = engine.unionOne(remainingPaths);
    const outLoops = pathsToShapeVertices(rebuilt);

    for (let i = 0; i < outLoops.length; i++) {
      const loop = outLoops[i]!;
      if (loop.length >= 3) {
        const keepIdentity = i === 0;
        const z = keepIdentity ? sh.zIndex : maxZ + 1;
        if (!keepIdentity) maxZ = z;
        newShapes.push({
          id: keepIdentity ? sh.id : `${sh.id}_part_${z}`,
          zIndex: z,
          closed: true,
          vertices: loop,
        });
      }
    }
  }

  // 3) Add merged shape(s)
  let next: DocumentModel = { shapes: newShapes, nextZ: maxZ + 1 };
  for (const loop of mergedLoops) {
    if (loop.length >= 3) next = addShape(next, loop, true);
  }

  return next;
}
