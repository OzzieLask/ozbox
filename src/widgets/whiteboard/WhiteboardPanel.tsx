import { useState } from "react";
import { requestCollapse } from "../shell";
import { ModeMark } from "./ModeMark";
import { clearDrawings, type Mode, setMode, useHasDrawing, useWhiteboardMode } from "./shared";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "draw", label: "Draw", hint: "Draw over your screen" },
  { id: "view", label: "View", hint: "Drawings stay; clicks go through" },
  { id: "off", label: "Off", hint: "Hide drawings (they're kept)" },
];

const STATUS: Record<Mode, string> = {
  draw: "Drawing now",
  view: "Showing drawings · clicks go through",
  off: "Off",
};

export function WhiteboardPanel() {
  const mode = useWhiteboardMode();
  const hasDrawing = useHasDrawing();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (next: Mode) => {
    if (busy || next === mode) return;
    setError(null);
    setBusy(true);
    try {
      await setMode(next);
      // Get out of the way of the drawing.
      if (next === "draw") requestCollapse();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wb-panel">
      <div className="wb-panel__modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`wb-panel__mode${mode === m.id ? " is-active" : ""}`}
            title={m.hint}
            aria-pressed={mode === m.id}
            disabled={busy}
            onClick={() => choose(m.id)}
          >
            <span className="wb-panel__mode-label">{m.label}</span>
            <span className="wb-panel__mode-hint">{m.hint}</span>
          </button>
        ))}
      </div>

      <div className={`wb-panel__status wb-panel__status--${mode}`}>
        {mode !== "off" && <ModeMark mode={mode} />}
        <span>{STATUS[mode]}</span>
        <span className="wb-panel__saved">{hasDrawing ? "· Drawing saved" : "· Nothing drawn"}</span>
      </div>

      <div className="wb-panel__footer">
        <span className="wb-panel__tip">Esc or Done stops drawing. Also in the tray menu.</span>
        <button className="wb-panel__clear" disabled={!hasDrawing} onClick={() => clearDrawings()}>
          Clear drawings
        </button>
      </div>

      {error && <p className="wb-panel__error">{error}</p>}
    </div>
  );
}
