/** Integer grid point in canonical document space (y increases upward). */
export type IPoint = Readonly<{ x: number; y: number }>;

export const GEOMETRY_EPS = 1e-9;
export const SNAP_GRID = 1;

export function quantizeToGrid(x: number, y: number, grid = SNAP_GRID): IPoint {
  return {
    x: Math.round(x / grid) * grid,
    y: Math.round(y / grid) * grid,
  };
}

export function samePoint(a: IPoint, b: IPoint, eps = GEOMETRY_EPS): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

/** Stable key for merging split vertices (fixed precision). */
export function vertexKey(p: IPoint): string {
  const q = 1e6;
  return `${Math.round(p.x * q)},${Math.round(p.y * q)}`;
}

export function toPoint64(p: IPoint): { x: number; y: number } {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}
