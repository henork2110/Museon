import type { Paths64 } from 'clipper2-ts';
import type { FillRule } from 'clipper2-ts';

export type BooleanOp = 'union' | 'intersect' | 'subtract' | 'xor';

export interface BooleanEngine {
  readonly fillRule: FillRule;
  execute(op: BooleanOp, subject: Paths64, clip: Paths64): Paths64;
  unionOne(paths: Paths64): Paths64;
}
