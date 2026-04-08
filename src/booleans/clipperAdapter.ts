/**
 * **Clipper2** is used only for 2D polygon booleans (union / subtract / intersect).
 * Face semantics and hit-testing live in the arrangement DCEL + robust predicates
 * ([`../geometry/predicates`](../geometry/predicates.ts)); do not use Clipper to
 * decide “what is a face” in the document model.
 */
import {
  Clipper,
  ClipType,
  FillRule,
  type Paths64,
} from 'clipper2-ts';
import type { BooleanEngine, BooleanOp } from './booleanEngine';

export class ClipperBooleanEngine implements BooleanEngine {
  readonly fillRule: FillRule;

  constructor(fillRule: FillRule = FillRule.NonZero) {
    this.fillRule = fillRule;
  }

  execute(op: BooleanOp, subject: Paths64, clip: Paths64): Paths64 {
    const clipType =
      op === 'union'
        ? ClipType.Union
        : op === 'intersect'
          ? ClipType.Intersection
          : op === 'subtract'
            ? ClipType.Difference
            : ClipType.Xor;
    if (op === 'union') {
      return Clipper.union(subject, clip, this.fillRule);
    }
    return Clipper.booleanOp(clipType, subject, clip, this.fillRule);
  }

  unionOne(paths: Paths64): Paths64 {
    return Clipper.union(paths, this.fillRule);
  }
}

/** Subject minus clip (top cuts base when subject=base paths, clip=top paths). */
export function subtractPaths(
  engine: BooleanEngine,
  base: Paths64,
  cutter: Paths64,
): Paths64 {
  return engine.execute('subtract', base, cutter);
}
