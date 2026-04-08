import type { IPoint } from '../geometry/types';
import type { ViewTransform } from '../render/canvasDraw';

export interface GridConfig {
  columns: number;
  rows: number;
  width: number;
  height: number;
}

export function cellSize(g: GridConfig): { cw: number; ch: number } {
  return {
    cw: g.width / Math.max(1, g.columns),
    ch: g.height / Math.max(1, g.rows),
  };
}

export function clampToWorld(p: IPoint, g: GridConfig): IPoint {
  return {
    x: Math.min(g.width, Math.max(0, p.x)),
    y: Math.min(g.height, Math.max(0, p.y)),
  };
}

/** Always snap to the nearest grid vertex, clamped to world bounds. */
export function snapToGrid(p: IPoint, g: GridConfig): IPoint {
  const { cw, ch } = cellSize(g);
  const sx = Math.round(p.x / cw) * cw;
  const sy = Math.round(p.y / ch) * ch;
  return clampToWorld({ x: sx, y: sy }, g);
}

/** Center the world in the canvas with padding. */
export function computeViewTransform(
  canvasW: number,
  canvasH: number,
  g: GridConfig,
): ViewTransform {
  const pad = 32;
  const aw = Math.max(1, canvasW - pad * 2);
  const ah = Math.max(1, canvasH - pad * 2);
  // Do not upscale world coordinates beyond 1:1 so entered width/height
  // behave like real pixel dimensions when the canvas is larger.
  const scale = Math.min(1, aw / g.width, ah / g.height);
  const scaledW = g.width * scale;
  const scaledH = g.height * scale;
  const offsetX = (canvasW - scaledW) / 2;
  const offsetY = (canvasH - scaledH) / 2;
  return { scale, offsetX, offsetY };
}
