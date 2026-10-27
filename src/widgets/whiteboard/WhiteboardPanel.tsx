import { useState } from "react";
import { requestCollapse } from "../shell";
import { clearDrawings, type Mode, setMode, useWhiteboardMode } from "./shared";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "draw", label: "Draw", hint: "Draw over your screen" },
  { id: "view", label: "View", hint: "Drawings stay; clicks go through" },
  { id: "off", label: "Off", hint: "Hide drawings (they're kept)" },
];

export function WhiteboardPanel() {
  const mode = useWhiteboardMode();
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);

  const choose = async (next: Mode) => {
    setError(null);
    try {
      await setMode(next);
      // Get out of the way of the drawing.
      if (next === "draw") requestCollapse();
    } catch (err) {
      setError(String(err));
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
            onClick={() => choose(m.id)}
          >
            <span className="wb-panel__mode-label">{m.label}</span>
            <span className="wb-panel__mode-hint">{m.hint}</span>
          </button>
        ))}
      </div>

      <div className="wb-panel__footer">
        <span className="wb-panel__tip">While drawing: Esc or Done to stop, Ctrl+Z to undo.</span>
        <button
          className="wb-panel__clear"
          onClick={() => {
            clearDrawings().then(() => {
              setCleared(true);
              setTimeout(() => setCleared(false), 1500);
            });
          }}
        >
          {cleared ? "Cleared" : "Clear drawings"}
        </button>
      </div>

      {error && <p className="wb-panel__error">{error}</p>}
    </div>
  );
}
