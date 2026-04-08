import type { Paths64 } from 'clipper2-ts';
import { FillRule } from 'clipper2-ts';
import type { Shape as LegacyShape } from '../document/model';
import type { Shape as PolygonShape } from '../model/types';
import { boundsOfPaths } from '../geometry/bounds';
import { toPath64 } from '../geometry/polygon';

/** SVG default Y is down; engine uses Y up. */
export function paths64ToSvgPathD(paths: Paths64, flipY = true): string {
  const parts: string[] = [];
  for (const p of paths) {
    if (p.length < 2) {
      continue;
    }
    const fy = (y: number) => (flipY ? -y : y);
    parts.push(`M ${p[0]!.x} ${fy(p[0]!.y)}`);
    for (let i = 1; i < p.length; i++) {
      parts.push(`L ${p[i]!.x} ${fy(p[i]!.y)}`);
    }
    parts.push('Z');
  }
  return parts.join(' ');
}

export function fillRuleToSvg(rule: FillRule): 'nonzero' | 'evenodd' {
  return rule === FillRule.EvenOdd ? 'evenodd' : 'nonzero';
}

type AnyShape = LegacyShape | PolygonShape;

function shapePoints(s: AnyShape): { x: number; y: number }[] {
  if ('vertices' in s) return s.vertices;
  return s.polygon.points;
}

function shapeClosed(s: AnyShape): boolean {
  if ('closed' in s) return s.closed;
  return true;
}

export function shapesToPaths64(shapes: AnyShape[]): Paths64 {
  const out: Paths64 = [];
  const seen = new Set<string>();
  for (const s of shapes) {
    const pts = shapePoints(s);
    if (shapeClosed(s) && pts.length >= 3) {
      const p = toPath64(pts);
      const key = p.map((v) => `${v.x},${v.y}`).join('|');
      if (!seen.has(key)) {
        seen.add(key);
        out.push(p);
      }
    }
  }
  return out;
}

/** Trigger a file download in the browser. */
export function downloadSvgFile(svg: string, filename = 'export.svg'): void {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.click();
  URL.revokeObjectURL(url);
}

export function exportShapesToSvg(
  shapes: AnyShape[],
  opts: {
    fillRule?: FillRule;
    flipY?: boolean;
    stroke?: string;
    fill?: string;
    background?: string;
  } = {},
): string {
  const fillRule = opts.fillRule ?? FillRule.NonZero;
  const flipY = opts.flipY ?? true;
  const paths = shapesToPaths64(shapes);
  const d = paths64ToSvgPathD(paths, flipY);
  const fr = fillRuleToSvg(fillRule);
  const fill = opts.fill ?? '#2d7ff9';
  const stroke = opts.stroke ?? '#0d2d5c';
  const b = boundsOfPaths(paths);
  const h = b.maxY - b.minY || 1;
  const w = b.maxX - b.minX || 1;
  const vb = flipY
    ? `${b.minX} ${-b.maxY} ${w} ${h}`
    : `${b.minX} ${b.minY} ${w} ${h}`;
  const bg =
    opts.background !== undefined
      ? `<rect x="${b.minX}" y="${flipY ? -b.maxY : b.minY}" width="${w}" height="${h}" fill="${opts.background}" />\n  `
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">
  ${bg}<g fill-rule="${fr}" fill="${fill}" stroke="${stroke}" stroke-width="1">
    <path d="${d}"/>
  </g>
</svg>`;
}

/** Compact path element only (embed in your own SVG). */
export function exportPathsToSvgFragment(paths: Paths64, fillRule: FillRule = FillRule.NonZero): string {
  const d = paths64ToSvgPathD(paths, true);
  const fr = fillRuleToSvg(fillRule);
  return `<path fill-rule="${fr}" d="${d}" />`;
}
