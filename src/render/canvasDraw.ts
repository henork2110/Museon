import type { Shape } from '../document/model';
import type { Arrangement, Face } from '../arrangement/dcel';
import type { IPoint } from '../geometry/types';

export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function worldToScreen(
  p: IPoint,
  vt: ViewTransform,
  canvasHeight: number,
): { x: number; y: number } {
  return {
    x: p.x * vt.scale + vt.offsetX,
    y: canvasHeight - (p.y * vt.scale + vt.offsetY),
  };
}

export function screenToWorld(
  sx: number,
  sy: number,
  vt: ViewTransform,
  canvasHeight: number,
): IPoint {
  const wx = (sx - vt.offsetX) / vt.scale;
  const wy = (canvasHeight - sy - vt.offsetY) / vt.scale;
  return { x: wx, y: wy };
}

export function distPointToSegment(p: IPoint, a: IPoint, b: IPoint): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 < 1e-20) {
    return Math.hypot(apx, apy);
  }
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * abx;
  const qy = a.y + t * aby;
  return Math.hypot(p.x - qx, p.y - qy);
}

export function pickShapeAt(
  p: IPoint,
  shapes: Shape[],
  thresholdWorld: number,
): Shape | null {
  let best: Shape | null = null;
  let bestD = thresholdWorld;
  for (const sh of shapes) {
    if (!sh.closed || sh.vertices.length < 2) {
      continue;
    }
    const v = sh.vertices;
    const n = v.length;
    for (let i = 0; i < n; i++) {
      const a = v[i]!;
      const b = v[(i + 1) % n]!;
      const d = distPointToSegment(p, a, b);
      if (d < bestD) {
        bestD = d;
        best = sh;
      }
    }
  }
  return best;
}

export function drawPolygon(
  ctx: CanvasRenderingContext2D,
  vertices: readonly IPoint[],
  closed: boolean,
  vt: ViewTransform,
  h: number,
  stroke: string,
  fill?: string | CanvasPattern | CanvasGradient,
) {
  if (vertices.length === 0) {
    return;
  }
  ctx.beginPath();
  const p0 = worldToScreen(vertices[0]!, vt, h);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < vertices.length; i++) {
    const pi = worldToScreen(vertices[i]!, vt, h);
    ctx.lineTo(pi.x, pi.y);
  }
  if (closed) {
    ctx.closePath();
  }
  if (fill !== undefined) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export function drawFaceHighlight(
  ctx: CanvasRenderingContext2D,
  face: Face,
  verts: readonly IPoint[],
  vt: ViewTransform,
  h: number,
  fill: string | CanvasPattern,
  stroke?: string,
) {
  const loop = face.boundary.map((i) => verts[i]!);
  drawPolygon(ctx, loop, true, vt, h, stroke ?? 'transparent', fill);
}

/**
 * Draw pre-unioned paths as a single compound fill.
 * Caller should pass the result of Clipper union so all winding
 * directions are consistent and edge stitching is eliminated.
 */
export function drawUnionedPaths(
  ctx: CanvasRenderingContext2D,
  loops: readonly (readonly IPoint[])[],
  vt: ViewTransform,
  h: number,
  fill: string,
) {
  if (loops.length === 0) return;
  ctx.beginPath();
  for (const loop of loops) {
    if (loop.length < 3) continue;
    const p0 = worldToScreen(loop[0]!, vt, h);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < loop.length; i++) {
      const pi = worldToScreen(loop[i]!, vt, h);
      ctx.lineTo(pi.x, pi.y);
    }
    ctx.closePath();
  }
  ctx.fillStyle = fill;
  // Non-zero fill avoids XOR-like holes when loops overlap (e.g. fallback raw shapes).
  ctx.fill();
}

export function drawArrangementDebug(
  ctx: CanvasRenderingContext2D,
  arr: Arrangement,
  vt: ViewTransform,
  h: number,
) {
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (const he of arr.halfEdges) {
    if (he.id > he.twin) {
      continue;
    }
    const a = arr.vertices[he.origin]!;
    const b = arr.vertices[he.dest]!;
    const p0 = worldToScreen(a, vt, h);
    const p1 = worldToScreen(b, vt, h);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
}
