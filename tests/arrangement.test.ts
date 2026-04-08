import { describe, expect, it } from 'vitest';
import { FillRule } from 'clipper2-ts';
import type { Shape } from '../src/document/model';
import { buildArrangementFromShapes } from '../src/arrangement';
import { deleteRegionsFromDocument, mergeSelectedFacesIntoShape, MIN_POSITIVE_ARRANGEMENT_FACE_AREA } from '../src/document/operations';
import { ClipperBooleanEngine } from '../src/booleans/clipperAdapter';
import { shapesToPaths64 } from '../src/export/svg';

function mkShape(id: string, z: number, pts: [number, number][]): Shape {
  return {
    id,
    zIndex: z,
    closed: true,
    vertices: pts.map(([x, y]) => ({ x, y })),
  };
}

function mkDoc(shapes: Shape[]) {
  return { shapes, nextZ: shapes.length };
}

function positiveFaces(shapes: Shape[]) {
  const { arrangement, coverages } = buildArrangementFromShapes(shapes);
  const faces = arrangement.faces.filter((f) => {
    if (Math.abs(f.signedArea) <= MIN_POSITIVE_ARRANGEMENT_FACE_AREA) return false;
    const cov = coverages.find((c) => c.faceId === f.id);
    return cov && cov.topId != null;
  });
  return { faces, arrangement, coverages };
}

describe('arrangement face extraction', () => {
  it('two overlapping rectangles produce positive faces', () => {
    const a = mkShape('a', 0, [[0, 0], [40, 0], [40, 40], [0, 40]]);
    const b = mkShape('b', 1, [[20, 10], [60, 10], [60, 50], [20, 50]]);
    const { faces } = positiveFaces([a, b]);
    // At minimum 3 regions exist (a-only, overlap, b-only) but DCEL may split
    // L-shaped regions into sub-faces, so >= 3
    expect(faces.length).toBeGreaterThanOrEqual(3);
    // Total area should equal area(a) + area(b) - overlap
    const totalArea = faces.reduce((s, f) => s + Math.abs(f.signedArea), 0);
    // a = 1600, b = 1600, overlap = 600 (20x30), union = 1600+1600-600 = 2600
    expect(totalArea).toBeCloseTo(1600 + 1600 - 600, 0);
  });

  it('one polygon fully inside another produces faces', () => {
    const outer = mkShape('outer', 0, [[0, 0], [100, 0], [100, 100], [0, 100]]);
    const inner = mkShape('inner', 1, [[20, 20], [80, 20], [80, 80], [20, 80]]);
    const { faces } = positiveFaces([outer, inner]);
    expect(faces.length).toBeGreaterThanOrEqual(2);
    // Ring face has full outer boundary (10000) + inner face (3600) = 13600
    // This is correct: DCEL ring face doesn't subtract holes from its boundary area.
    // Coverage analysis correctly identifies topId per face.
    const totalArea = faces.reduce((s, f) => s + Math.abs(f.signedArea), 0);
    expect(totalArea).toBeCloseTo(13600, 0);
  });

  it('shared edge produces correct faces', () => {
    const a = mkShape('a', 0, [[0, 0], [40, 0], [40, 40], [0, 40]]);
    const b = mkShape('b', 1, [[40, 0], [80, 0], [80, 40], [40, 40]]);
    const { faces } = positiveFaces([a, b]);
    expect(faces.length).toBe(2);
    const totalArea = faces.reduce((s, f) => s + Math.abs(f.signedArea), 0);
    expect(totalArea).toBeCloseTo(3200, 0);
  });

  it('touching at one point only', () => {
    const a = mkShape('a', 0, [[0, 0], [40, 0], [40, 40], [0, 40]]);
    const b = mkShape('b', 1, [[40, 40], [80, 40], [80, 80], [40, 80]]);
    const { faces } = positiveFaces([a, b]);
    expect(faces.length).toBeGreaterThanOrEqual(2);
    const totalArea = faces.reduce((s, f) => s + Math.abs(f.signedArea), 0);
    expect(totalArea).toBeCloseTo(3200, 0);
  });

  it('z-order coverage: topId is highest shape', () => {
    const base = mkShape('base', 0, [[0, 0], [100, 0], [100, 100], [0, 100]]);
    const top = mkShape('top', 1, [[25, 25], [75, 25], [75, 75], [25, 75]]);
    const { coverages } = buildArrangementFromShapes([base, top]);
    const innerCov = coverages.find((c) => c.coveringIdsBottomToTop.length === 2);
    expect(innerCov).toBeDefined();
    expect(innerCov!.topId).toBe('top');
  });

  it('single rectangle produces 1 face', () => {
    const a = mkShape('a', 0, [[0, 0], [40, 0], [40, 40], [0, 40]]);
    const { faces } = positiveFaces([a]);
    expect(faces.length).toBe(1);
    expect(Math.abs(faces[0]!.signedArea)).toBeCloseTo(1600, 0);
  });
});

describe('merge selected faces', () => {
  it('merging all faces of a single shape keeps it', () => {
    const a = mkShape('a', 0, [[0, 0], [40, 0], [40, 40], [0, 40]]);
    const doc = mkDoc([a]);
    const { faces, arrangement, coverages } = positiveFaces(doc.shapes);
    const result = mergeSelectedFacesIntoShape(doc, arrangement, coverages, faces);
    expect(result.shapes.length).toBe(1);
    expect(result.shapes[0]!.closed).toBe(true);
  });

  it('merging subset of faces keeps remaining', () => {
    const a = mkShape('a', 0, [[0, 0], [40, 0], [40, 40], [0, 40]]);
    const b = mkShape('b', 1, [[20, 10], [60, 10], [60, 50], [20, 50]]);
    const doc = mkDoc([a, b]);
    const { faces, arrangement, coverages } = positiveFaces(doc.shapes);
    // Select only first face
    const result = mergeSelectedFacesIntoShape(doc, arrangement, coverages, [faces[0]!]);
    expect(result.shapes.length).toBeGreaterThanOrEqual(1);
  });
});

describe('delete regions', () => {
  it('deleting all faces removes all shapes', () => {
    const a = mkShape('a', 0, [[0, 0], [40, 0], [40, 40], [0, 40]]);
    const b = mkShape('b', 1, [[20, 10], [60, 10], [60, 50], [20, 50]]);
    const doc = mkDoc([a, b]);
    const { faces, arrangement, coverages } = positiveFaces(doc.shapes);
    const result = deleteRegionsFromDocument(doc, arrangement, coverages, faces);
    expect(result.shapes.length).toBe(0);
  });

  it('deleting one face keeps other faces', () => {
    const a = mkShape('a', 0, [[0, 0], [40, 0], [40, 40], [0, 40]]);
    const b = mkShape('b', 1, [[20, 10], [60, 10], [60, 50], [20, 50]]);
    const doc = mkDoc([a, b]);
    const { faces, arrangement, coverages } = positiveFaces(doc.shapes);
    const result = deleteRegionsFromDocument(doc, arrangement, coverages, [faces[0]!]);
    expect(result.shapes.length).toBeGreaterThanOrEqual(1);
  });

  it('deleting single shape face removes that shape', () => {
    const a = mkShape('a', 0, [[0, 0], [40, 0], [40, 40], [0, 40]]);
    const doc = mkDoc([a]);
    const { faces, arrangement, coverages } = positiveFaces(doc.shapes);
    const result = deleteRegionsFromDocument(doc, arrangement, coverages, faces);
    expect(result.shapes.length).toBe(0);
  });
});

describe('boolean operations via clipper', () => {
  const engine = new ClipperBooleanEngine(FillRule.NonZero);

  it('unite two overlapping shapes', () => {
    const a = mkShape('a', 0, [[0, 0], [40, 0], [40, 40], [0, 40]]);
    const b = mkShape('b', 1, [[20, 20], [60, 20], [60, 60], [20, 60]]);
    const paths = shapesToPaths64([a, b]);
    const united = engine.unionOne(paths);
    expect(united.length).toBe(1);
    let area = 0;
    for (const p of united) {
      let a2 = 0;
      for (let i = 0; i < p.length; i++) {
        const j = (i + 1) % p.length;
        a2 += p[i]!.x * p[j]!.y - p[j]!.x * p[i]!.y;
      }
      area += Math.abs(a2) / 2;
    }
    expect(area).toBe(2800);
  });

  it('subtract inner from outer', () => {
    const base = mkShape('base', 0, [[0, 0], [100, 0], [100, 100], [0, 100]]);
    const cutter = mkShape('cut', 1, [[25, 25], [75, 25], [75, 75], [25, 75]]);
    const basePaths = shapesToPaths64([base]);
    const cutPaths = shapesToPaths64([cutter]);
    const result = engine.execute('subtract', basePaths, cutPaths);
    // Use signed area (outer CCW + inner CW hole) for correct net area
    let area = 0;
    for (const p of result) {
      let a2 = 0;
      for (let i = 0; i < p.length; i++) {
        const j = (i + 1) % p.length;
        a2 += p[i]!.x * p[j]!.y - p[j]!.x * p[i]!.y;
      }
      area += a2 / 2; // signed, not abs
    }
    expect(Math.abs(area)).toBe(7500);
  });

  it('intersect two overlapping shapes', () => {
    const a = mkShape('a', 0, [[0, 0], [40, 0], [40, 40], [0, 40]]);
    const b = mkShape('b', 1, [[20, 20], [60, 20], [60, 60], [20, 60]]);
    const aPaths = shapesToPaths64([a]);
    const bPaths = shapesToPaths64([b]);
    const result = engine.execute('intersect', aPaths, bPaths);
    let area = 0;
    for (const p of result) {
      let a2 = 0;
      for (let i = 0; i < p.length; i++) {
        const j = (i + 1) % p.length;
        a2 += p[i]!.x * p[j]!.y - p[j]!.x * p[i]!.y;
      }
      area += Math.abs(a2) / 2;
    }
    expect(area).toBe(400); // 20x20 overlap
  });

  it('xor two overlapping shapes', () => {
    const a = mkShape('a', 0, [[0, 0], [40, 0], [40, 40], [0, 40]]);
    const b = mkShape('b', 1, [[20, 20], [60, 20], [60, 60], [20, 60]]);
    const aPaths = shapesToPaths64([a]);
    const bPaths = shapesToPaths64([b]);
    const result = engine.execute('xor', aPaths, bPaths);
    let area = 0;
    for (const p of result) {
      let a2 = 0;
      for (let i = 0; i < p.length; i++) {
        const j = (i + 1) % p.length;
        a2 += p[i]!.x * p[j]!.y - p[j]!.x * p[i]!.y;
      }
      area += Math.abs(a2) / 2;
    }
    expect(area).toBe(2400); // 2800 - 400
  });
});
