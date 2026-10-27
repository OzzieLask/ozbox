import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load, type Store } from "@tauri-apps/plugin-store";

/** Shared by the OzBox widget panel and the whiteboard overlay window. */

export type Mode = "off" | "draw" | "view";
/** Matches whiteboard.rs. */
export const MODE_EVENT = "ozbox://whiteboard-mode";

export const setMode = (mode: Mode) => invoke("set_whiteboard_mode", { mode });

export function useWhiteboardMode(): Mode {
  const [mode, setModeState] = useState<Mode>("off");
  useEffect(() => {
    invoke<Mode>("whiteboard_mode").then(setModeState).catch(() => {});
    const unlisten = listen<Mode>(MODE_EVENT, ({ payload }) => setModeState(payload));
    return () => {
      unlisten.then((off) => off());
    };
  }, []);
  return mode;
}

// ---- Drawings ----

export type ShapeKind = "pen" | "highlighter" | "line" | "arrow" | "rect" | "ellipse";
export type Point = [number, number];

export type Stroke = {
  id: string;
  kind: ShapeKind;
  color: string;
  /** Line width in CSS px. */
  size: number;
  /** Freehand: every point. Shapes: [start, end]. */
  points: Point[];
};

/**
 * Drawings live in their own file (both windows can open it; the store plugin keeps
 * one copy in Rust), so clearing from OzBox reaches an open overlay via onKeyChange.
 */
const FILE = "whiteboard.json";
export const STROKES_KEY = "strokes";

let file: Promise<Store> | null = null;
export function drawingsFile(): Promise<Store> {
  file ??= load(FILE, { autoSave: 500 });
  return file;
}

export async function clearDrawings() {
  await (await drawingsFile()).set(STROKES_KEY, []);
}

/** True while there's a saved drawing, whether or not the whiteboard is on. */
export function useHasDrawing(): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    drawingsFile().then(async (f) => {
      const strokes = await f.get<Stroke[]>(STROKES_KEY);
      if (!cancelled) setHas((strokes?.length ?? 0) > 0);
      unlisten = await f.onKeyChange<Stroke[]>(STROKES_KEY, (value) => setHas((value?.length ?? 0) > 0));
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
  return has;
}

// ---- Toolbar <-> layer messages (the toolbar is its own glass window) ----

export type Tool = ShapeKind | "laser" | "eraser";
export type ToolSettings = { tool: Tool; color: string; size: number };
export type Action = "undo" | "redo" | "clear";
export type History = { canUndo: boolean; canRedo: boolean; hasDrawing: boolean };

/** Toolbar -> layer: the chosen tool, color and size. */
export const TOOL_EVENT = "ozbox://wb-tool";
/** Toolbar -> layer: undo / redo / clear. */
export const ACTION_EVENT = "ozbox://wb-action";
/** Layer -> toolbar: what undo/redo can do, so buttons can disable. */
export const HISTORY_EVENT = "ozbox://wb-history";
/** Layer -> toolbar: "I just loaded; send me the current tool". */
export const READY_EVENT = "ozbox://wb-ready";
