export type Point = Readonly<{ x: number; y: number }>;

export interface Segment {
  a: Point;
  b: Point;
}

export interface Polygon {
  /** Closed loop without duplicated last point. */
  points: Point[];
}

export interface Shape {
  id: string;
  zIndex: number;
  polygon: Polygon;
}

export interface DocumentModel {
  shapes: Shape[];
  nextZ: number;
  nextId: number;
}

export function createEmptyDocument(): DocumentModel {
  return { shapes: [], nextZ: 0, nextId: 1 };
}
