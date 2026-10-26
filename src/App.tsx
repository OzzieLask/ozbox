import { useCallback, useEffect, useRef, useState } from "react";
import { Glass } from "./glass/Glass";
import { Orb } from "./orb/Orb";
import { Dock, DOCK_ITEM_SIZE, DOCK_ITEMS, DOCK_PADDING } from "./dock/Dock";
import { placeOrbWindow } from "./window/position";
import { type Anchor, morphTo, TILE_SIZE } from "./window/morph";
import "./App.css";

/** How long the dock contents take to fade out before the window shrinks. */
const FADE_OUT_MS = 120;

const DOCK_WIDTH = TILE_SIZE + DOCK_PADDING + DOCK_ITEMS.length * DOCK_ITEM_SIZE;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>({ right: false, bottom: false });
  // Ignore toggles while a morph is already being set up.
  const busy = useRef(false);

  useEffect(() => {
    const cleanup = placeOrbWindow();
    return () => {
      cleanup.then((unlisten) => unlisten());
    };
  }, []);

  const toggle = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (open) {
        setOpen(false);
        await wait(FADE_OUT_MS);
        await morphTo(TILE_SIZE, TILE_SIZE);
      } else {
        setAnchor(await morphTo(DOCK_WIDTH, TILE_SIZE));
        setOpen(true);
      }
    } finally {
      busy.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggle]);

  const shellClass = [
    "shell",
    open && "shell--open",
    anchor.right && "shell--right",
    anchor.bottom && "shell--bottom",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Glass>
      {/* Laid out at full dock width and pinned to the tile's corner: as the window
          grows, it uncovers more of the strip rather than reflowing it. */}
      <div className={shellClass} style={{ width: DOCK_WIDTH }}>
        <Orb active={open} onClick={toggle} />
        <div className="shell__items">
          <Dock items={DOCK_ITEMS} onSelect={(id) => console.log("open widget", id)} />
        </div>
      </div>
    </Glass>
  );
}
