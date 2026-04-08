import type { ViewTransform } from './canvasDraw';
import { worldToScreen } from './canvasDraw';
import type { GridConfig } from '../grid/world';
import { cellSize } from '../grid/world';

export function drawLineGrid(
  ctx: CanvasRenderingContext2D,
  vt: ViewTransform,
  canvasH: number,
  g: GridConfig,
  stroke: string,
) {
  const { cw, ch } = cellSize(g);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  for (let i = 0; i <= g.columns; i++) {
    const x = i * cw;
    const p0 = worldToScreen({ x, y: 0 }, vt, canvasH);
    const p1 = worldToScreen({ x, y: g.height }, vt, canvasH);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  for (let j = 0; j <= g.rows; j++) {
    const y = j * ch;
    const p0 = worldToScreen({ x: 0, y }, vt, canvasH);
    const p1 = worldToScreen({ x: g.width, y }, vt, canvasH);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
}

export function drawDotGrid(
  ctx: CanvasRenderingContext2D,
  vt: ViewTransform,
  canvasH: number,
  g: GridConfig,
  dotColor: string,
  radius = 1.25,
) {
  const { cw, ch } = cellSize(g);
  ctx.fillStyle = dotColor;
  for (let i = 0; i <= g.columns; i++) {
    for (let j = 0; j <= g.rows; j++) {
      const p = worldToScreen({ x: i * cw, y: j * ch }, vt, canvasH);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
