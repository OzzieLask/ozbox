import type { Point, Stroke } from "../widgets/whiteboard/shared";

/** Highlighter: wider and see-through, so text underneath stays readable. */
const HIGHLIGHTER_SCALE = 4;
const HIGHLIGHTER_ALPHA = 0.35;

export function lineWidth(stroke: Stroke): number {
  return stroke.kind === "highlighter" ? stroke.size * HIGHLIGHTER_SCALE : stroke.size;
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const { kind, points, color } = stroke;
  if (points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth(stroke);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "highlighter") ctx.globalAlpha = HIGHLIGHTER_ALPHA;

  const [a, b = a] = points;
  ctx.beginPath();
  switch (kind) {
    case "pen":
    case "highlighter":
      if (points.length === 1) {
        // A tap: a dot.
        ctx.arc(a[0], a[1], ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }
      smoothPath(ctx, points);
      break;
    case "line":
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      break;
    case "arrow": {
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const head = Math.max(12, stroke.size * 4);
      for (const side of [-1, 1]) {
        const t = angle + Math.PI + (side * Math.PI) / 7;
        ctx.moveTo(b[0], b[1]);
        ctx.lineTo(b[0] + head * Math.cos(t), b[1] + head * Math.sin(t));
      }
      break;
    }
    case "rect":
      ctx.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      break;
    case "ellipse":
      ctx.ellipse(
        (a[0] + b[0]) / 2,
        (a[1] + b[1]) / 2,
        Math.abs(b[0] - a[0]) / 2,
        Math.abs(b[1] - a[1]) / 2,
        0,
        0,
        Math.PI * 2,
      );
      break;
  }
  ctx.stroke();
  ctx.restore();
}

/** Curves through the midpoints between samples, which smooths out mouse jitter. */
function smoothPath(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last[0], last[1]);
}

/** The stroke as a polyline, for hit-testing the eraser. */
function outline(stroke: Stroke): Point[] {
  const [a, b = a] = stroke.points;
  switch (stroke.kind) {
    case "pen":
    case "highlighter":
    case "line":
    case "arrow":
      return stroke.points;
    case "rect":
      return [a, [b[0], a[1]], b, [a[0], b[1]], a];
    case "ellipse": {
      const [cx, cy] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const [rx, ry] = [Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2];
      return Array.from({ length: 49 }, (_, i): Point => {
        const t = (i / 48) * Math.PI * 2;
        return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
      });
    }
  }
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Does an eraser of `radius` at `p` touch this stroke? */
export function hits(stroke: Stroke, p: Point, radius: number): boolean {
  const reach = radius + lineWidth(stroke) / 2;
  const line = outline(stroke);
  if (line.length === 1) return Math.hypot(p[0] - line[0][0], p[1] - line[0][1]) <= reach;
  for (let i = 1; i < line.length; i++) {
    if (distanceToSegment(p, line[i - 1], line[i]) <= reach) return true;
  }
  return false;
}

// ---- Laser pointer ----

export type LaserPoint = { x: number; y: number; t: number };
export const LASER_FADE_MS = 900;

/** A glowing red trail that fades out over LASER_FADE_MS. */
export function drawLaser(ctx: CanvasRenderingContext2D, trail: LaserPoint[], now: number) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(255, 40, 40, 0.9)";
  ctx.shadowBlur = 12;
  for (let i = 1; i < trail.length; i++) {
    const age = now - trail[i].t;
    const life = 1 - age / LASER_FADE_MS;
    if (life <= 0) continue;
    ctx.globalAlpha = life;
    ctx.strokeStyle = "rgb(255, 60, 60)";
    ctx.lineWidth = 2 + 4 * life;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
  ctx.restore();
}
