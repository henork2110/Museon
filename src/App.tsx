import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { FillRule } from 'clipper2-ts';
import { motion } from 'motion/react';
import './App.css';
import { buildArrangementFromShapes } from './arrangement';
import { locateFaceSmallest } from './arrangement/pointLocation';
import type { FaceCoverage } from './arrangement/coverage';
import { ClipperBooleanEngine } from './booleans/clipperAdapter';
import {
  addShape,
  createEmptyDocument,
  type DocumentModel,
} from './document/model';
import {
  deleteRegionsFromDocument,
  MIN_POSITIVE_ARRANGEMENT_FACE_AREA,
} from './document/operations';
import { downloadSvgFile, exportShapesToSvg, shapesToPaths64 } from './export/svg';
import {
  cellSize,
  computeViewTransform,
  type GridConfig,
  snapToGrid,
} from './grid/world';
import {
  drawFaceHighlight,
  drawPolygon,
  drawUnionedPaths,
  screenToWorld,
  type ViewTransform,
  worldToScreen,
} from './render/canvasDraw';
import { drawDotGrid, drawLineGrid } from './render/gridDraw';
import { getOrangeHatchPattern } from './render/hatchPattern';
import { pointInPolygonNonZero, signedArea } from './geometry/polygon';

type UiMode = 'design' | 'builder';

const engine = new ClipperBooleanEngine(FillRule.NonZero);

const DIM_MIN = 1;
const DIM_MAX = 128;
const PX_MAX = 9999;

// ─── history ───
type HistState = { stack: DocumentModel[]; index: number };
type HistAction =
  | { type: 'push'; doc: DocumentModel }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' };

function historyReducer(state: HistState, action: HistAction): HistState {
  switch (action.type) {
    case 'push': {
      const { stack, index } = state;
      return { stack: [...stack.slice(0, index + 1), action.doc], index: index + 1 };
    }
    case 'undo':
      return { ...state, index: Math.max(0, state.index - 1) };
    case 'redo':
      return { ...state, index: Math.min(state.stack.length - 1, state.index + 1) };
    case 'reset':
      return { stack: [createEmptyDocument()], index: 0 };
    default:
      return state;
  }
}

function useDocumentHistory(initial: DocumentModel) {
  const [state, dispatch] = useReducer(historyReducer, { stack: [initial], index: 0 });
  const doc = state.stack[state.index]!;
  const push = useCallback((next: DocumentModel) => dispatch({ type: 'push', doc: next }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  return { doc, push, undo, redo, reset };
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

function dedupeConsecutivePoints(points: readonly { x: number; y: number }[]) {
  if (points.length <= 1) return [...points];
  const out: { x: number; y: number }[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1]!;
    const cur = points[i]!;
    if (prev.x !== cur.x || prev.y !== cur.y) out.push(cur);
  }
  if (out.length > 1) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (first.x === last.x && first.y === last.y) out.pop();
  }
  return out;
}

function DeferredInputInner({
  initial,
  onCommit,
  min,
  max,
  suffix,
}: {
  initial: number;
  onCommit: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  const [local, setLocal] = useState(String(initial));

  const commit = () => {
    const n = Number(local);
    if (Number.isFinite(n)) {
      const clamped = clampInt(n, min, max);
      onCommit(clamped);
      setLocal(String(clamped));
    } else {
      setLocal(String(initial));
    }
  };

  return (
    <div className="parrot-px-field">
      <input
        type="text"
        inputMode="numeric"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
      />
      {suffix ? <span className="parrot-unit">{suffix}</span> : null}
    </div>
  );
}

function DeferredInput(props: {
  value: number;
  onCommit: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <DeferredInputInner
      key={props.value}
      initial={props.value}
      onCommit={props.onCommit}
      min={props.min}
      max={props.max}
      suffix={props.suffix}
    />
  );
}

// ─── Animated pill button ───
function Pill({
  children,
  className,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <motion.button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      title={title}
      whileHover={disabled ? {} : { scale: 1.04 }}
      whileTap={disabled ? {} : { scale: 0.94 }}
      transition={{ type: 'spring', visualDuration: 0.2, bounce: 0.4 }}
    >
      {children}
    </motion.button>
  );
}

// ─── App ───
export default function App() {
  const { doc, push, undo, redo, reset } = useDocumentHistory(createEmptyDocument());
  const [uiMode, setUiMode] = useState<UiMode>('design');
  const [columns, setColumns] = useState(4);
  const [rows, setRows] = useState(8);
  const [gridW, setGridW] = useState(800);
  const [gridH, setGridH] = useState(320);
  const [shapeColor, setShapeColor] = useState('#ffffff');
  const [pageColor] = useState('#1c1c1c');
  const [strokeWidth, setStrokeWidth] = useState(0);
  const [draft, setDraft] = useState<{ x: number; y: number }[]>([]);
  const [hoverFaceId, setHoverFaceId] = useState<number | null>(null);
  const [selectedFaceIds, setSelectedFaceIds] = useState<Set<number>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'add' | 'remove'>('add');
  const [mouseWorld, setMouseWorld] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);
  const docRef = useRef(doc);
  const [canvasPx, setCanvasPx] = useState({ w: 800, h: 600 });

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { docRef.current = doc; }, [doc]);

  const grid: GridConfig = useMemo(
    () => ({ columns, rows, width: Math.max(1, gridW), height: Math.max(1, gridH) }),
    [columns, rows, gridW, gridH],
  );

  // ─── canvas sizing (HiDPI) ───
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  useLayoutEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setCanvasPx({ w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = Math.round(canvasPx.w * dpr);
    c.height = Math.round(canvasPx.h * dpr);
    c.style.width = canvasPx.w + 'px';
    c.style.height = canvasPx.h + 'px';
  }, [canvasPx.w, canvasPx.h, dpr]);

  const vt: ViewTransform = useMemo(
    () => computeViewTransform(canvasPx.w, canvasPx.h, grid),
    [canvasPx.w, canvasPx.h, grid],
  );

  const arrangementBundle = useMemo(() => {
    if (doc.shapes.length === 0) return null;
    try {
      return buildArrangementFromShapes(doc.shapes);
    } catch {
      return null;
    }
  }, [doc.shapes]);

  // Clear face selection when arrangement changes (shapes changed).
  // Track the previous arrangement ref and reset in render (not in effect).
  const prevArrangementRef = useRef(arrangementBundle);
  if (prevArrangementRef.current !== arrangementBundle) {
    prevArrangementRef.current = arrangementBundle;
    if (selectedFaceIds.size > 0) setSelectedFaceIds(new Set());
    if (hoverFaceId != null) setHoverFaceId(null);
  }

  const hatchPattern = useMemo(() => getOrangeHatchPattern(), []);

  // Union all shapes for Design mode display.
  const displayLoops: { x: number; y: number }[][] = useMemo(() => {
    const closed = doc.shapes.filter((s) => s.closed && s.vertices.length >= 3);
    if (closed.length === 0) return [];
    try {
      const ccwShapes = closed.map((s) => {
        if (signedArea(s.vertices) < 0) {
          return { ...s, vertices: [...s.vertices].reverse() };
        }
        return s;
      });
      const paths = shapesToPaths64(ccwShapes);
      const unioned = engine.unionOne(paths);
      return unioned.map((p) => p.map((pt) => ({ x: pt.x, y: pt.y })));
    } catch {
      return closed.map((s) => [...s.vertices]);
    }
  }, [doc.shapes]);

  // Helper: get faces that are "positive" (have real area and are covered by a shape)
  const positiveFaces = useMemo(() => {
    if (!arrangementBundle) return [];
    const { arrangement, coverages } = arrangementBundle;
    const covMap = new Map<number, FaceCoverage>();
    for (const c of coverages) covMap.set(c.faceId, c);
    return arrangement.faces.filter((f) => {
      if (Math.abs(f.signedArea) <= MIN_POSITIVE_ARRANGEMENT_FACE_AREA) return false;
      const cov = covMap.get(f.id);
      return cov && cov.topId != null;
    });
  }, [arrangementBundle]);

  // ─── paint ───
  const paint = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = canvasPx.w;
    const H = canvasPx.h;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = pageColor;
    ctx.fillRect(0, 0, W, H);

    drawLineGrid(ctx, vt, H, grid, '#2c2c2c');
    drawDotGrid(ctx, vt, H, grid, 'rgba(255,255,255,0.8)', 2);

    if (uiMode === 'design') {
      // Design mode: show unioned shapes as solid fill
      drawUnionedPaths(ctx, displayLoops, vt, H, shapeColor);

      // Draft polygon preview
      if (mouseWorld) {
        const snapped = snapToGrid(mouseWorld, grid);
        const { cw, ch } = cellSize(grid);
        const maxWorldDist = Math.min(cw, ch) * 0.45;
        const d = Math.hypot(mouseWorld.x - snapped.x, mouseWorld.y - snapped.y);
        if (d <= maxWorldDist) {
          const sp = worldToScreen(snapped, vt, H);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (draft.length > 0) {
        drawPolygon(ctx, draft, false, vt, H, '#ff7a45');
        if (mouseWorld) {
          const snapped = snapToGrid(mouseWorld, grid);
          const last = draft[draft.length - 1]!;
          const sLast = worldToScreen(last, vt, H);
          const sMouse = worldToScreen(snapped, vt, H);
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(255, 122, 69, 0.7)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(sLast.x, sLast.y);
          ctx.lineTo(sMouse.x, sMouse.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#ff7a45';
          ctx.beginPath();
          ctx.arc(sMouse.x, sMouse.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        if (draft.length >= 3) {
          const p0 = worldToScreen(draft[0]!, vt, H);
          ctx.fillStyle = '#ff7a45';
          ctx.beginPath();
          ctx.arc(p0.x, p0.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const pt of draft) {
          const sp = worldToScreen(pt, vt, H);
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (uiMode === 'builder' && arrangementBundle) {
      const { arrangement, coverages } = arrangementBundle;
      const covMap = new Map<number, FaceCoverage>();
      for (const cov of coverages) covMap.set(cov.faceId, cov);

      // Draw each individual shape with subtle outlines so user can see overlaps
      for (const sh of doc.shapes) {
        if (!sh.closed || sh.vertices.length < 3) continue;
        drawPolygon(ctx, sh.vertices, true, vt, H, 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0.06)');
      }

      // Draw all arrangement face boundaries (subdivision lines)
      for (const he of arrangement.halfEdges) {
        if (he.id > he.twin) continue; // draw each edge once
        const a = arrangement.vertices[he.origin]!;
        const b = arrangement.vertices[he.dest]!;
        const p0 = worldToScreen(a, vt, H);
        const p1 = worldToScreen(b, vt, H);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }

      // Draw faces: covered faces get a fill, selected faces get accent
      for (const f of arrangement.faces) {
        if (Math.abs(f.signedArea) <= MIN_POSITIVE_ARRANGEMENT_FACE_AREA) continue;
        const cov = covMap.get(f.id);
        if (!cov || cov.topId == null) continue; // empty face, skip

        const isSelected = selectedFaceIds.has(f.id);
        const isHovered = f.id === hoverFaceId;

        if (isSelected) {
          // Selected: solid orange fill
          drawFaceHighlight(ctx, f, arrangement.vertices, vt, H,
            'rgba(255, 140, 50, 0.45)', 'rgba(255, 140, 50, 0.8)');
        } else if (isHovered) {
          // Hovered: hatch pattern
          const pat = hatchPattern ?? 'rgba(255, 120, 40, 0.3)';
          drawFaceHighlight(ctx, f, arrangement.vertices, vt, H,
            pat, 'rgba(255, 120, 40, 0.6)');
        } else {
          // Normal covered face: subtle fill
          drawFaceHighlight(ctx, f, arrangement.vertices, vt, H,
            'rgba(255, 255, 255, 0.08)', 'transparent');
        }
      }

      // Draw selected face borders on top for clarity
      for (const f of arrangement.faces) {
        if (!selectedFaceIds.has(f.id)) continue;
        const loop = f.boundary.map((i) => arrangement.vertices[i]!);
        ctx.beginPath();
        const p0 = worldToScreen(loop[0]!, vt, H);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < loop.length; i++) {
          const pi = worldToScreen(loop[i]!, vt, H);
          ctx.lineTo(pi.x, pi.y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255, 140, 50, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [
    canvasPx.w, canvasPx.h, dpr, pageColor, uiMode, grid, vt,
    displayLoops, draft, mouseWorld, arrangementBundle, hoverFaceId,
    hatchPattern, shapeColor, doc.shapes, selectedFaceIds,
  ]);

  useEffect(() => { paint(); }, [paint]);

  // ─── pointer events ───
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const wx = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, vt, canvasPx.h);
    if (uiMode === 'design') setMouseWorld(wx);
    if (uiMode === 'builder' && arrangementBundle) {
      const face = locateFaceSmallest(wx, arrangementBundle.arrangement);
      const faceId = face?.id ?? null;
      setHoverFaceId(faceId);

      // Drag selection: add/remove faces as mouse moves
      if (isDragging && faceId != null) {
        const cov = arrangementBundle.coverages.find((c) => c.faceId === faceId);
        if (cov && cov.topId != null) {
          const f = arrangementBundle.arrangement.faces.find((ff) => ff.id === faceId);
          if (f && Math.abs(f.signedArea) > MIN_POSITIVE_ARRANGEMENT_FACE_AREA) {
            setSelectedFaceIds((prev) => {
              const next = new Set(prev);
              if (dragMode === 'add') {
                next.add(faceId);
              } else {
                next.delete(faceId);
              }
              return next;
            });
          }
        }
      }
    } else {
      setHoverFaceId(null);
    }
  };

  const onPointerLeave = () => {
    setMouseWorld(null);
    setHoverFaceId(null);
  };

  const onContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (uiMode === 'design') {
      setDraft((d) => d.slice(0, -1));
    }
  };

  const closeDraft = useCallback(() => {
    const d = draftRef.current;
    const ddoc = docRef.current;
    const cleaned = dedupeConsecutivePoints(d);
    if (cleaned.length < 3) { setDraft([]); return; }

    // Check if all vertices of the new shape are inside any existing closed shape.
    // If so, subtract (cut) from ALL shapes that overlap the cutter.
    const closedShapes = ddoc.shapes.filter((s) => s.closed && s.vertices.length >= 3);
    const isInside = closedShapes.some((s) =>
      cleaned.every((pt) => pointInPolygonNonZero(pt, s.vertices)),
    );

    if (isInside) {
      // Subtract the cutter from every shape it overlaps
      const cutterPaths = shapesToPaths64([{
        id: '_cut', zIndex: 0, closed: true, vertices: cleaned,
      }]);
      let next: DocumentModel = { shapes: [], nextZ: ddoc.nextZ };
      for (const sh of ddoc.shapes) {
        if (!sh.closed || sh.vertices.length < 3) {
          next = { shapes: [...next.shapes, sh], nextZ: next.nextZ };
          continue;
        }
        const basePaths = shapesToPaths64([sh]);
        const result = engine.execute('subtract', basePaths, cutterPaths);
        for (const loop of result) {
          if (loop.length >= 3) {
            next = addShape(next, loop.map((pt) => ({ x: pt.x, y: pt.y })), true);
          }
        }
      }
      push(next);
    } else {
      push(addShape(ddoc, cleaned, true));
    }
    setDraft([]);
  }, [push]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const raw = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, vt, canvasPx.h);

    if (uiMode === 'design') {
      const p = snapToGrid(raw, grid);
      const cur = draftRef.current;
      if (cur.length >= 3) {
        const d0 = cur[0]!;
        const { cw, ch } = cellSize(grid);
        const closeThresh = Math.min(cw, ch) * 0.45;
        if (Math.hypot(p.x - d0.x, p.y - d0.y) <= closeThresh) {
          closeDraft();
          return;
        }
      }
      setDraft((d) => {
        const last = d[d.length - 1];
        if (last && last.x === p.x && last.y === p.y) return d;
        return [...d, p];
      });
      return;
    }

    if (uiMode === 'builder' && arrangementBundle) {
      const face = locateFaceSmallest(raw, arrangementBundle.arrangement);
      if (!face) return;

      const cov = arrangementBundle.coverages.find((c) => c.faceId === face.id);
      if (!cov || cov.topId == null) return; // empty face, ignore
      if (Math.abs(face.signedArea) <= MIN_POSITIVE_ARRANGEMENT_FACE_AREA) return;

      // Option+Click: immediately delete the face
      if (e.altKey) {
        const result = deleteRegionsFromDocument(
          doc, arrangementBundle.arrangement, arrangementBundle.coverages, [face],
        );
        push(result);
        return;
      }

      // Normal click: toggle face selection
      setIsDragging(true);
      setDragMode('add');
      setSelectedFaceIds((prev) => {
        const next = new Set(prev);
        if (next.has(face.id)) {
          next.delete(face.id);
        } else {
          next.add(face.id);
        }
        return next;
      });
    }
  };

  const onPointerUp = () => {
    if (isDragging) {
      setIsDragging(false);
    }
  };

  // ─── builder actions ───

  /** Delete selected faces (or hovered face if none selected) from all shapes. */
  const onDeleteSelected = useCallback(() => {
    if (!arrangementBundle) return;
    const { arrangement, coverages } = arrangementBundle;

    // Use selected faces, or fall back to hovered face
    let facesToDelete = arrangement.faces.filter((f) => selectedFaceIds.has(f.id));
    if (facesToDelete.length === 0 && hoverFaceId != null) {
      const hovered = arrangement.faces.find((f) => f.id === hoverFaceId);
      if (hovered) facesToDelete = [hovered];
    }
    if (facesToDelete.length === 0) return;

    push(deleteRegionsFromDocument(doc, arrangement, coverages, facesToDelete));
    setSelectedFaceIds(new Set());
  }, [arrangementBundle, selectedFaceIds, hoverFaceId, doc, push]);

  /** Select all positive faces. */
  const onSelectAll = useCallback(() => {
    setSelectedFaceIds(new Set(positiveFaces.map((f) => f.id)));
  }, [positiveFaces]);

  const onDownload = () => {
    const svg = exportShapesToSvg(doc.shapes, {
      fill: shapeColor,
      stroke: strokeWidth > 0 ? shapeColor : 'none',
      strokeWidth,
      background: pageColor,
    });
    downloadSvgFile(svg, 'shape-export.svg');
  };

  // ─── keyboard ───
  const switchMode = useCallback(
    (m: UiMode) => {
      setUiMode(m);
      setDraft([]);
      setHoverFaceId(null);
      setMouseWorld(null);
      setSelectedFaceIds(new Set());
    },
    [],
  );

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && uiMode === 'design') closeDraft();
      if (ev.key === 'Escape') {
        if (uiMode === 'design') setDraft([]);
        if (uiMode === 'builder') {
          setSelectedFaceIds(new Set());
        }
      }
      if (ev.key === 'z' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        if (ev.shiftKey) redo(); else undo();
      }
      // Option+Delete or Option+Backspace: clear all shapes (undoable)
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && ev.altKey) {
        ev.preventDefault();
        push(createEmptyDocument());
        setDraft([]);
        setSelectedFaceIds(new Set());
        return;
      }
      if (ev.key === '1' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        switchMode('design');
      }
      if (ev.key === '2' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        switchMode('builder');
      }
      // Delete/Backspace in builder mode: delete selected or hovered face
      if (uiMode === 'builder' && (ev.key === 'Delete' || ev.key === 'Backspace') && !ev.altKey) {
        ev.preventDefault();
        onDeleteSelected();
      }
      // 'a' to select all in builder mode
      if (uiMode === 'builder' && ev.key === 'a' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        onSelectAll();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [uiMode, closeDraft, undo, redo, reset, switchMode, selectedFaceIds, onDeleteSelected, onSelectAll]);

  // ─── mode toggle ───
  const modeSeg = (
    <div className="parrot-seg">
      <Pill
        className={uiMode === 'design' ? 'parrot-pill parrot-pill--active' : 'parrot-pill'}
        onClick={() => switchMode('design')}
      >
        Design
      </Pill>
      <Pill
        className={uiMode === 'builder' ? 'parrot-pill parrot-pill--active' : 'parrot-pill'}
        onClick={() => switchMode('builder')}
      >
        Builder
      </Pill>
    </div>
  );

  return (
    <div className="parrot" style={{ background: pageColor }}>
      <div className="parrot-canvas-wrap" ref={canvasWrapRef}>
        <canvas
          ref={canvasRef}
          className="parrot-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onContextMenu={onContextMenu}
        />
      </div>

      <header className="parrot-header">
        <div className="parrot-header__left">{modeSeg}</div>
        <div className="parrot-header__right">
          <Pill className="parrot-pill parrot-pill--accent" onClick={onDownload}>
            Download
          </Pill>
        </div>
      </header>

      {uiMode === 'design' ? (
        <footer className="parrot-footer parrot-footer--design">
          <div className="parrot-panel">
            <div className="parrot-row parrot-row--color">
              <span className="parrot-row__label">Shape color</span>
              <label className="parrot-swatch">
                <input type="color" value={shapeColor} onChange={(e) => setShapeColor(e.target.value)} />
                <span className="parrot-swatch__ui" style={{ background: shapeColor }} />
              </label>
            </div>
            <label className="parrot-row parrot-row--field">
              <span>Line weight</span>
              <DeferredInput value={strokeWidth} min={0} max={100} onCommit={setStrokeWidth} suffix="px" />
            </label>
          </div>
          <div className="parrot-panel">
            <label className="parrot-row parrot-row--field">
              <span>Columns</span>
              <DeferredInput value={columns} min={DIM_MIN} max={DIM_MAX} onCommit={setColumns} />
            </label>
            <label className="parrot-row parrot-row--field">
              <span>Rows</span>
              <DeferredInput value={rows} min={DIM_MIN} max={DIM_MAX} onCommit={setRows} />
            </label>
          </div>
          <div className="parrot-panel">
            <label className="parrot-row parrot-row--field">
              <span>Width</span>
              <DeferredInput value={gridW} min={0} max={PX_MAX} onCommit={setGridW} suffix="px" />
            </label>
            <label className="parrot-row parrot-row--field">
              <span>Height</span>
              <DeferredInput value={gridH} min={0} max={PX_MAX} onCommit={setGridH} suffix="px" />
            </label>
          </div>
        </footer>
      ) : (
        <footer className="parrot-footer parrot-footer--builder">
          <div className="parrot-hints">
            <div className="parrot-hint">
              <div className="parrot-hint__keys">
                <span className="parrot-hint__key">Option</span>
                <span className="parrot-hint__key parrot-hint__key--icon">{'\u{100B46}'}</span>
              </div>
              <span className="parrot-hint__label">delete face</span>
            </div>
            <div className="parrot-hint">
              <div className="parrot-hint__keys">
                <span className="parrot-hint__key">Option</span>
                <span className="parrot-hint__key parrot-hint__key--icon">{'\u{10019B}'}</span>
              </div>
              <span className="parrot-hint__label">delete all shapes</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
