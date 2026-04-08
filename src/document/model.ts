import type { IPoint } from '../geometry/types';

export type ShapeId = string;

export interface Shape {
  id: ShapeId;
  /** Lower = drawn first = base in z semantics. */
  zIndex: number;
  closed: boolean;
  vertices: IPoint[];
}

export interface DocumentModel {
  shapes: Shape[];
  nextZ: number;
}

export function createEmptyDocument(): DocumentModel {
  return { shapes: [], nextZ: 0 };
}

export function sortedShapesByZ(doc: DocumentModel): Shape[] {
  return [...doc.shapes].sort((a, b) => a.zIndex - b.zIndex);
}

function polySignedArea(verts: readonly IPoint[]): number {
  let a = 0;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += verts[i]!.x * verts[j]!.y - verts[j]!.x * verts[i]!.y;
  }
  return a / 2;
}

/** Ensure vertices wind counter-clockwise (positive signed area). */
export function ensureCCW(verts: IPoint[]): IPoint[] {
  if (verts.length < 3) return verts;
  if (polySignedArea(verts) < 0) return [...verts].reverse();
  return verts;
}

export function addShape(doc: DocumentModel, vertices: IPoint[], closed: boolean): DocumentModel {
  const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const shape: Shape = {
    id,
    zIndex: doc.nextZ,
    closed,
    vertices: closed ? ensureCCW([...vertices]) : [...vertices],
  };
  return {
    shapes: [...doc.shapes, shape],
    nextZ: doc.nextZ + 1,
  };
}

export function removeShape(doc: DocumentModel, id: ShapeId): DocumentModel {
  return { ...doc, shapes: doc.shapes.filter((s) => s.id !== id) };
}

export function replaceShapes(_doc: DocumentModel, shapes: Shape[]): DocumentModel {
  const maxZ = shapes.reduce((m, s) => Math.max(m, s.zIndex), -1);
  return { shapes, nextZ: maxZ + 1 };
}
