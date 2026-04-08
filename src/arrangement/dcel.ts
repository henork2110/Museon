import type { IPoint } from '../geometry/types';
import { GEOMETRY_EPS, vertexKey } from '../geometry/types';
import { angle } from '../geometry/vec';
import type { TaggedSegment } from './splitSegments';
import { signedArea } from '../geometry/polygon';

export interface HalfEdge {
  id: number;
  origin: number;
  dest: number;
  twin: number;
  next: number;
  shapeIds: string[];
}

export interface Arrangement {
  vertices: IPoint[];
  halfEdges: HalfEdge[];
  faces: Face[];
}

export interface Face {
  id: number;
  /** Vertex indices walking the boundary (CCW for bounded faces in y-up). */
  boundary: number[];
  /** Half-edge id where this face was discovered. */
  startHe: number;
  signedArea: number;
}

function addVertex(v: IPoint, verts: IPoint[], index: Map<string, number>): number {
  const k = vertexKey(v);
  let i = index.get(k);
  if (i === undefined) {
    i = verts.length;
    verts.push({ x: v.x, y: v.y });
    index.set(k, i);
  }
  return i;
}

/** Build DCEL from split tagged segments (open line segments, no duplicates). */
export function buildArrangement(segments: TaggedSegment[]): Arrangement {
  const verts: IPoint[] = [];
  const vmap = new Map<string, number>();
  const halfEdges: HalfEdge[] = [];

  type Undir = { i: number; j: number; tags: string[] };
  const undirs: Undir[] = [];
  for (const s of segments) {
    const i = addVertex(s.a, verts, vmap);
    const j = addVertex(s.b, verts, vmap);
    if (i === j) {
      continue;
    }
    undirs.push({ i, j, tags: s.shapeIds });
  }

  for (const { i, j, tags } of undirs) {
    const idA = halfEdges.length;
    const idB = idA + 1;
    halfEdges.push(
      { id: idA, origin: i, dest: j, twin: idB, next: -1, shapeIds: tags },
      { id: idB, origin: j, dest: i, twin: idA, next: -1, shapeIds: tags },
    );
  }

  const byOrigin = new Map<number, number[]>();
  for (const he of halfEdges) {
    const list = byOrigin.get(he.origin);
    if (list) {
      list.push(he.id);
    } else {
      byOrigin.set(he.origin, [he.id]);
    }
  }

  for (const [, ids] of byOrigin) {
    const vo = verts[halfEdges[ids[0]].origin];
    ids.sort((a, b) => {
      const ha = halfEdges[a];
      const hb = halfEdges[b];
      const ax = verts[ha.dest].x - vo.x;
      const ay = verts[ha.dest].y - vo.y;
      const bx = verts[hb.dest].x - vo.x;
      const by = verts[hb.dest].y - vo.y;
      return angle(ax, ay) - angle(bx, by);
    });
  }

  for (const he of halfEdges) {
    const head = he.dest;
    const outgoing = byOrigin.get(head)!;
    const twin = halfEdges[he.twin];
    const idx = outgoing.indexOf(twin.id);
    if (idx < 0) {
      continue;
    }
    const n = outgoing.length;
    const nextId = outgoing[(idx - 1 + n) % n];
    he.next = nextId;
  }

  const faces = extractFaces(halfEdges, verts);
  return { vertices: verts, halfEdges, faces };
}

function extractFaces(halfEdges: HalfEdge[], verts: IPoint[]): Face[] {
  const visited = new Set<number>();
  const faces: Face[] = [];
  let faceId = 0;

  for (const he of halfEdges) {
    if (visited.has(he.id)) {
      continue;
    }
    const cycle: number[] = [];
    let cur = he.id;
    const start = cur;
    let steps = 0;
    do {
      visited.add(cur);
      const h = halfEdges[cur];
      cycle.push(h.origin);
      cur = h.next;
      if (++steps > halfEdges.length * 2) {
        break;
      }
    } while (cur !== start && cur >= 0);

    if (cycle.length < 3) {
      continue;
    }
    const pts = cycle.map((vi) => verts[vi]);
    const area = signedArea(pts);
    // Only keep CCW faces (positive area = bounded interior regions).
    // CW faces (negative area) are unbounded exterior faces.
    if (area <= GEOMETRY_EPS * GEOMETRY_EPS) {
      continue;
    }
    faces.push({
      id: faceId,
      boundary: cycle,
      startHe: he.id,
      signedArea: area,
    });
    faceId += 1;
  }

  return faces;
}
