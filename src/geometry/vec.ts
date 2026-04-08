import type { IPoint } from './types';

export function sub(a: IPoint, b: IPoint): { x: number; y: number } {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

export function dot(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

export function len(ax: number, ay: number): number {
  return Math.hypot(ax, ay);
}

/** Polar angle in (-pi, pi], CCW from +x (math coords, y up). */
export function angle(ax: number, ay: number): number {
  return Math.atan2(ay, ax);
}
