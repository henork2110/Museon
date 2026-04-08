import type { Shape } from '../../src/document/model';

export interface FixtureFile {
  id: string;
  shapes: Array<{
    id: string;
    z: number;
    closed: boolean;
    vertices: [number, number][];
  }>;
  expect: Partial<{
    faceCountMin: number;
    intersectionArea: number;
    subtractArea: number;
  }>;
}

export function fixtureToShapes(f: FixtureFile): Shape[] {
  return f.shapes.map((s) => ({
    id: s.id,
    zIndex: s.z,
    closed: s.closed,
    vertices: s.vertices.map(([x, y]) => ({ x, y })),
  }));
}
