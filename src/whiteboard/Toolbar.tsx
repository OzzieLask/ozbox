import type { ReactNode } from "react";
import type { ShapeKind } from "../widgets/whiteboard/shared";

export type Tool = ShapeKind | "laser" | "eraser";

const COLORS = ["#ffffff", "#1a1a1a", "#ff4d4d", "#ffd43b", "#51cf66", "#4dabf7", "#cc5de8"];
const SIZES = [2, 4, 8];

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

type ToolbarProps = {
  tool: Tool;
  color: string;
  size: number;
  onTool: (tool: Tool) => void;
  onColor: (color: string) => void;
  onSize: (size: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onView: () => void;
  onDone: () => void;
};

/** The floating glass toolbar at the top of the whiteboard, shown while drawing. */
export function Toolbar(props: ToolbarProps) {
  const { tool, color, size } = props;
  const usesColor = tool !== "eraser" && tool !== "laser";

  return (
    <div className="toolbar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="toolbar__group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`toolbar__button${tool === t.id ? " is-active" : ""}`}
            title={t.label}
            aria-label={t.label}
            aria-pressed={tool === t.id}
            onClick={() => props.onTool(t.id)}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className={`toolbar__group${usesColor ? "" : " is-dimmed"}`}>
        {COLORS.map((c) => (
          <button
            key={c}
            className={`toolbar__swatch${color === c ? " is-active" : ""}`}
            style={{ background: c }}
            aria-label={`Color ${c}`}
            onClick={() => props.onColor(c)}
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
            onClick={() => props.onSize(s)}
          >
            <span className="toolbar__size" style={{ width: s + 3, height: s + 3 }} />
          </button>
        ))}
      </div>

      <div className="toolbar__group">
        <button className="toolbar__button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!props.canUndo} onClick={props.onUndo}>
          <I><path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></I>
        </button>
        <button className="toolbar__button" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!props.canRedo} onClick={props.onRedo}>
          <I><path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></I>
        </button>
        <button className="toolbar__button" title="Clear all" aria-label="Clear all" onClick={props.onClear}>
          <I><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></I>
        </button>
      </div>

      <div className="toolbar__group">
        <button className="toolbar__text" title="Keep drawings on screen; clicks go through" onClick={props.onView}>
          View
        </button>
        <button className="toolbar__text toolbar__text--done" title="Stop drawing (Esc)" onClick={props.onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
