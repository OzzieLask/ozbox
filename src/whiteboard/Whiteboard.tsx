import { useCallback, useEffect, useRef, useState } from "react";
import {
  drawingsFile,
  type Point,
  setMode,
  type Stroke,
  STROKES_KEY,
  useWhiteboardMode,
} from "../widgets/whiteboard/shared";
import { drawLaser, drawStroke, hits, LASER_FADE_MS, type LaserPoint } from "./draw";
import { type Tool, Toolbar } from "./Toolbar";

const ERASER_RADIUS = 10;
const UNDO_LIMIT = 100;

/** Size a canvas to the window at device resolution, drawing in CSS px. */
function fitCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function Whiteboard() {
  const mode = useWhiteboardMode();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ff4d4d");
  const [size, setSize] = useState(4);

  // Undo history: earlier versions of the drawing. Not saved; per session.
  const past = useRef<Stroke[][]>([]);
  const future = useRef<Stroke[][]>([]);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  // Two layers: finished strokes (redrawn only when they change) and the live
  // layer (the stroke being drawn, the laser, the eraser ring) redrawn per move.
  const baseCanvas = useRef<HTMLCanvasElement>(null);
  const liveCanvas = useRef<HTMLCanvasElement>(null);
  const baseCtx = useRef<CanvasRenderingContext2D | null>(null);
  const liveCtx = useRef<CanvasRenderingContext2D | null>(null);

  const current = useRef<Stroke | null>(null);
  /** While erasing: the drawing before the drag began, and what's left so far. */
  const eraseStart = useRef<Stroke[] | null>(null);
  const erasing = useRef<Stroke[] | null>(null);
  const laser = useRef<LaserPoint[]>([]);
  const laserFrame = useRef<number | null>(null);
  const hover = useRef<Point | null>(null);

  // ---- Saving & history ----

  const save = (next: Stroke[]) =>
    drawingsFile().then((f) => f.set(STROKES_KEY, next)).catch((err) => console.error("save drawing", err));

  const commit = useCallback((next: Stroke[]) => {
    past.current = [...past.current.slice(-UNDO_LIMIT + 1), strokesRef.current];
    future.current = [];
    setStrokes(next);
    save(next);
  }, []);

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(strokesRef.current);
    setStrokes(previous);
    save(previous);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(strokesRef.current);
    setStrokes(next);
    save(next);
  }, []);

  // Load saved drawings, and follow changes made elsewhere (e.g. Clear in OzBox).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    drawingsFile().then(async (f) => {
      setStrokes((await f.get<Stroke[]>(STROKES_KEY)) ?? []);
      unlisten = await f.onKeyChange<Stroke[]>(STROKES_KEY, (value) => {
        // Our own saves echo back with the same content; only external changes matter.
        if (JSON.stringify(value ?? []) !== JSON.stringify(strokesRef.current)) setStrokes(value ?? []);
      });
    });
    return () => unlisten?.();
  }, []);

  // ---- Rendering ----

  const renderLive = useCallback(() => {
    const ctx = liveCtx.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (current.current) drawStroke(ctx, current.current);
    if (laser.current.length) drawLaser(ctx, laser.current, performance.now());
    if (tool === "eraser" && hover.current) {
      const [x, y] = hover.current;
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.arc(x, y, ERASER_RADIUS + size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }, [tool, size]);

  const renderBase = useCallback(() => {
    const ctx = baseCtx.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const s of strokesRef.current) drawStroke(ctx, s);
  }, []);

  useEffect(() => {
    const fit = () => {
      if (baseCanvas.current) baseCtx.current = fitCanvas(baseCanvas.current);
      if (liveCanvas.current) liveCtx.current = fitCanvas(liveCanvas.current);
      renderBase();
      renderLive();
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [renderBase, renderLive]);

  useEffect(renderBase, [strokes, renderBase]);
  useEffect(renderLive, [tool, renderLive]);

  /** Keep animating while the laser trail is fading. */
  const animateLaser = useCallback(() => {
    const now = performance.now();
    laser.current = laser.current.filter((p) => now - p.t < LASER_FADE_MS);
    renderLive();
    laserFrame.current = laser.current.length ? requestAnimationFrame(animateLaser) : null;
  }, [renderLive]);

  // ---- Input ----

  const eraseAt = (p: Point) => {
    const radius = ERASER_RADIUS + size;
    const left = erasing.current!.filter((s) => !hits(s, p, radius));
    if (left.length !== erasing.current!.length) {
      erasing.current = left;
      setStrokes(left);
    }
  };

  const addPoint = (p: Point) => {
    if (tool === "eraser") return eraseAt(p);
    if (tool === "laser") {
      laser.current.push({ x: p[0], y: p[1], t: performance.now() });
      if (laserFrame.current === null) laserFrame.current = requestAnimationFrame(animateLaser);
      return;
    }
    const stroke = current.current;
    if (!stroke) return;
    if (stroke.kind === "pen" || stroke.kind === "highlighter") {
      const last = stroke.points[stroke.points.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.75) stroke.points.push(p);
    } else {
      stroke.points[1] = p;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e.isPrimary || mode !== "draw") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p: Point = [e.clientX, e.clientY];
    if (tool === "eraser") {
      eraseStart.current = strokesRef.current;
      erasing.current = strokesRef.current;
      eraseAt(p);
    } else if (tool === "laser") {
      addPoint(p);
    } else {
      current.current = {
        id: crypto.randomUUID(),
        kind: tool,
        color,
        size,
        points: tool === "pen" || tool === "highlighter" ? [p] : [p, p],
      };
    }
    renderLive();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    hover.current = [e.clientX, e.clientY];
    if (e.buttons & 1) {
      // Coalesced events carry the in-between samples a fast stroke would otherwise lose.
      for (const ev of e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) {
        addPoint([ev.clientX, ev.clientY]);
      }
    }
    renderLive();
  };

  const onPointerUp = () => {
    const stroke = current.current;
    current.current = null;
    if (stroke) {
      const [a, b] = stroke.points;
      // A click with a shape tool draws nothing.
      const freehand = stroke.kind === "pen" || stroke.kind === "highlighter";
      const empty = !freehand && Math.hypot(b[0] - a[0], b[1] - a[1]) < 2;
      if (!empty) commit([...strokesRef.current, stroke]);
    }
    if (erasing.current) {
      // The eraser updated the screen as it went; record the whole drag as one undo step.
      const left = erasing.current;
      const before = eraseStart.current;
      erasing.current = null;
      eraseStart.current = null;
      if (before && before.length !== left.length) {
        past.current = [...past.current.slice(-UNDO_LIMIT + 1), before];
        future.current = [];
        save(left);
      }
    }
    renderLive();
  };

  // ---- Keyboard ----

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("off");
      else if (e.ctrlKey && e.key.toLowerCase() === "z" && e.shiftKey) redo();
      else if (e.ctrlKey && e.key.toLowerCase() === "z") undo();
      else if (e.ctrlKey && e.key.toLowerCase() === "y") redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div className={`board board--${mode}`}>
      <canvas ref={baseCanvas} className="board__canvas" />
      <canvas
        ref={liveCanvas}
        className={`board__canvas board__canvas--live tool-${tool}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          hover.current = null;
          renderLive();
        }}
      />
      {mode === "draw" && (
        <Toolbar
          tool={tool}
          color={color}
          size={size}
          onTool={setTool}
          onColor={setColor}
          onSize={setSize}
          canUndo={past.current.length > 0}
          canRedo={future.current.length > 0}
          onUndo={undo}
          onRedo={redo}
          onClear={() => strokes.length && commit([])}
          onView={() => setMode("view")}
          onDone={() => setMode("off")}
        />
      )}
    </div>
  );
}
