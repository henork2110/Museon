/** Orange diagonal hatch like Figma Builder selection (cached per document). */
let hatchCanvas: HTMLCanvasElement | null = null;

export function getOrangeHatchPattern(): CanvasPattern | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (!hatchCanvas) {
    const c = document.createElement('canvas');
    c.width = 6;
    c.height = 6;
    const x = c.getContext('2d');
    if (!x) {
      return null;
    }
    x.strokeStyle = 'rgba(255, 120, 40, 0.85)';
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(0, 6);
    x.lineTo(6, 0);
    x.stroke();
    hatchCanvas = c;
  }
  const ctx = hatchCanvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  return ctx.createPattern(hatchCanvas, 'repeat');
}
