import type { DocumentModel, Point, Shape } from './types';

export function addPolygonShape(doc: DocumentModel, points: Point[]): DocumentModel {
  if (points.length < 3) return doc;
  const shape: Shape = {
    id: `s_${doc.nextId}`,
    zIndex: doc.nextZ,
    polygon: { points: [...points] },
  };
  return {
    shapes: [...doc.shapes, shape],
    nextZ: doc.nextZ + 1,
    nextId: doc.nextId + 1,
  };
}

export function replaceShapes(doc: DocumentModel, shapes: Shape[]): DocumentModel {
  const maxZ = shapes.reduce((m, s) => Math.max(m, s.zIndex), -1);
  const maxId = shapes.reduce((m, s) => {
    const n = Number(s.id.replace(/^s_/, ''));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return {
    shapes,
    nextZ: maxZ + 1,
    nextId: Math.max(doc.nextId, maxId + 1),
  };
}
