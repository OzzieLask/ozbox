import { useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./Orb.css";

const DRAG_THRESHOLD = 4; // px of movement before a press becomes a drag

type OrbProps = {
  active: boolean;
  onClick: () => void;
};

type Press = { x: number; y: number; dragging: boolean };

// Drag commands are async; chain them so Rust always sees them in the order sent
// (e.g. a quick flick's "end" must not overtake its "start").
let commandQueue: Promise<unknown> = Promise.resolve();
function send(cmd: string, args?: Record<string, unknown>) {
  commandQueue = commandQueue.then(() => invoke(cmd, args)).catch((err) => console.error(cmd, err));
}

/** The OZ button: click to toggle the control center, press-and-move to drag the window. */
export function Orb({ active, onClick }: OrbProps) {
  const press = useRef<Press | null>(null);

  return (
    <button
      className={`orb${active ? " orb--active" : ""}`}
      aria-label="OzBox"
      aria-expanded={active}
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0) return;
        // Keep receiving this pointer's events even if it slips outside the window.
        e.currentTarget.setPointerCapture(e.pointerId);
        press.current = { x: e.screenX, y: e.screenY, dragging: false };
        send("stop_glide");
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p || p.dragging) return;
        if (Math.hypot(e.screenX - p.x, e.screenY - p.y) > DRAG_THRESHOLD) {
          p.dragging = true;
          // Rust takes over from here: follows the cursor, then glides after release.
          send("start_drag", { pointerType: e.pointerType });
        }
      }}
      onPointerUp={() => {
        const p = press.current;
        press.current = null;
        if (!p) return;
        if (p.dragging) send("end_drag");
        else onClick();
      }}
      onPointerCancel={() => {
        if (press.current?.dragging) send("end_drag");
        press.current = null;
      }}
    >
      <span className="orb__label">OZ</span>
    </button>
  );
}
