import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { Glass } from "../glass/Glass";
import {
  ACTION_EVENT,
  type Action,
  HISTORY_EVENT,
  type History,
  READY_EVENT,
  setMode,
  TOOL_EVENT,
  type Tool,
  type ToolSettings,
} from "../widgets/whiteboard/shared";

const COLORS = [
  { value: "#ffffff", name: "White" },
  { value: "#1a1a1a", name: "Black" },
  { value: "#ff3b30", name: "Red" },
  { value: "#34c759", name: "Green" },
  { value: "#0a84ff", name: "Blue" },
];
const SIZES = [2, 4, 8];
const SETTINGS_KEY = "ozbox.whiteboard.tool";
/** Horizontal padding around the buttons, in px; matches .toolbar__row in toolbar.css. */
const ROW_PADDING = 6;
const DEFAULT_SETTINGS: ToolSettings = { tool: "pen", color: "#ff3b30", size: 4 };

// 18px line icons on a 24-unit grid.
function I({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const TOOLS: { id: Tool; label: string; icon: ReactNode }[] = [
  { id: "pen", label: "Pen", icon: <I><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" /></I> },
  { id: "highlighter", label: "Highlighter", icon: <I><path d="M9 15l-4 5h6l2-2M9 15l7.5-10.5a2 2 0 0 1 3 3L13 18zM9 15l4 3" /></I> },
  { id: "line", label: "Line", icon: <I><path d="M5 19L19 5" /></I> },
  { id: "arrow", label: "Arrow", icon: <I><path d="M5 19L19 5M10 5h9v9" /></I> },
  { id: "rect", label: "Rectangle", icon: <I><rect x="4" y="6" width="16" height="12" rx="1.5" /></I> },
  { id: "ellipse", label: "Ellipse", icon: <I><ellipse cx="12" cy="12" rx="8.5" ry="6.5" /></I> },
  { id: "laser", label: "Laser pointer", icon: <I><circle cx="15" cy="9" r="2.5" /><path d="M4 20l7-7M13.5 3v1.5M21 9h-1.5M19.5 4.5l-1 1" /></I> },
  { id: "eraser", label: "Eraser", icon: <I><path d="M8 20h12M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8z" /></I> },
];

function loadSettings(): ToolSettings {
  try {
    const saved: ToolSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
    // A color that's since been removed from the palette falls back to the default.
    return COLORS.some((c) => c.value === saved.color) ? saved : { ...saved, color: DEFAULT_SETTINGS.color };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const sendAction = (action: Action) => emit(ACTION_EVENT, action);

/**
 * The whiteboard's toolbar, in its own small acrylic window above the drawing
 * layer. It owns the tool choice and tells the layer about it; the layer reports
 * back what undo/redo can do.
 */
export function Toolbar() {
  const [settings, setSettings] = useState<ToolSettings>(loadSettings);
  const [history, setHistory] = useState<History>({ canUndo: false, canRedo: false, hasDrawing: false });
  const { tool, color, size } = settings;
  const update = (patch: Partial<ToolSettings>) => setSettings((s) => ({ ...s, ...patch }));

  // Tell the layer about every change, and again whenever it (re)loads.
  useEffect(() => {
    emit(TOOL_EVENT, settings);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Remembering the tool is a nicety; carry on without it.
    }
    const unlisten = listen(READY_EVENT, () => emit(TOOL_EVENT, settings));
    return () => {
      unlisten.then((off) => off());
    };
  }, [settings]);

  useEffect(() => {
    const unlisten = listen<History>(HISTORY_EVENT, ({ payload }) => setHistory(payload));
    return () => {
      unlisten.then((off) => off());
    };
  }, []);

  // Clicking the toolbar focuses it, so it handles the drawing shortcuts too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.ctrlKey && key === "z") sendAction(e.shiftKey ? "redo" : "undo");
      else if (e.ctrlKey && key === "y") sendAction("redo");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Size the window to the buttons exactly (Rust recenters it), and again if they
  // ever change size (e.g. once the font loads).
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    const fit = () =>
      invoke("fit_whiteboard_toolbar", { width: Math.ceil(el.getBoundingClientRect().width) + ROW_PADDING * 2 }).catch(
        (err) => console.error("fit toolbar", err),
      );
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const usesColor = tool !== "eraser" && tool !== "laser";

  return (
    <Glass className="toolbar">
      <div className="toolbar__row">
        <div className="toolbar__content" ref={content}>
        <div className="toolbar__group">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`toolbar__button${tool === t.id ? " is-active" : ""}`}
              title={t.label}
              aria-label={t.label}
              aria-pressed={tool === t.id}
              onClick={() => update({ tool: t.id })}
            >
              {t.icon}
            </button>
          ))}
        </div>

        <div className={`toolbar__group${usesColor ? "" : " is-dimmed"}`}>
          {COLORS.map((c) => (
            <button
              key={c.value}
              className={`toolbar__swatch${color === c.value ? " is-active" : ""}`}
              style={{ background: c.value }}
              title={c.name}
              aria-label={c.name}
              onClick={() => update({ color: c.value })}
            />
          ))}
        </div>

        <div className={`toolbar__group${tool === "laser" ? " is-dimmed" : ""}`}>
          {SIZES.map((s) => (
            <button
              key={s}
              className={`toolbar__button${size === s ? " is-active" : ""}`}
              title={`Size ${s}`}
              aria-label={`Size ${s}`}
              onClick={() => update({ size: s })}
            >
              <span className="toolbar__size" style={{ width: s + 3, height: s + 3 }} />
            </button>
          ))}
        </div>

        <div className="toolbar__group">
          <button className="toolbar__button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!history.canUndo} onClick={() => sendAction("undo")}>
            <I><path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></I>
          </button>
          <button className="toolbar__button" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!history.canRedo} onClick={() => sendAction("redo")}>
            <I><path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></I>
          </button>
          <button className="toolbar__button" title="Clear all" aria-label="Clear all" disabled={!history.hasDrawing} onClick={() => sendAction("clear")}>
            <I><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></I>
          </button>
        </div>

        <div className="toolbar__group">
          <button className="toolbar__text" title="Keep drawings on screen; clicks go through" onClick={() => setMode("view")}>
            View
          </button>
          <button className="toolbar__text toolbar__text--done" title="Stop drawing (Esc)" onClick={() => setMode("off")}>
            Done
          </button>
        </div>
        </div>
      </div>
    </Glass>
  );
}
