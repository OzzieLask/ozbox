import { useCallback, useEffect, useRef, useState } from "react";
import { Glass } from "./glass/Glass";
import { Orb } from "./orb/Orb";
import { Dock, DOCK_ITEM_SIZE, DOCK_PADDING } from "./dock/Dock";
import { findWidget, WIDGETS } from "./widgets/registry";
import { COLLAPSE_REQUEST } from "./widgets/shell";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { placeOrbWindow, resetOrbPosition } from "./window/position";
import { type Anchor, morphTo, TILE_SIZE } from "./window/morph";
import "./App.css";

/** How long content takes to fade out before the window shrinks around it. */
const FADE_OUT_MS = 120;
/** Fade-out plus the morph animation (morph.rs DURATION), with a little slack. */
const COLLAPSE_MS = FADE_OUT_MS + 300;
/** Sent by the tray's "Reset position" item (tray.rs). */
const RESET_POSITION_EVENT = "ozbox://reset-position";

/** Widgets that draw something on the OZ tile. */
const TILE_BADGES = WIDGETS.flatMap(({ id, TileBadge }) => (TileBadge ? [{ id, TileBadge }] : []));

const DOCK_WIDTH = TILE_SIZE + DOCK_PADDING + WIDGETS.length * DOCK_ITEM_SIZE;

/** What the window is showing: just the tile, the dock strip, or a widget's panel. */
type View = { kind: "tile" } | { kind: "dock" } | { kind: "panel"; id: string };

function sizeOf(view: View): { width: number; height: number } {
  if (view.kind === "tile") return { width: TILE_SIZE, height: TILE_SIZE };
  const panel = view.kind === "panel" ? findWidget(view.id)?.panelSize : undefined;
  if (!panel) return { width: DOCK_WIDTH, height: TILE_SIZE };
  return { width: Math.max(DOCK_WIDTH, panel.width), height: TILE_SIZE + panel.height };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  const [view, setView] = useState<View>({ kind: "tile" });
  const [anchor, setAnchor] = useState<Anchor>({ right: false, bottom: false });
  // Content is faded out before the window shrinks, and in once it starts growing.
  const [dockVisible, setDockVisible] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  // Ignore new navigation while a transition is being set up.
  const busy = useRef(false);

  useEffect(() => {
    const cleanup = placeOrbWindow();
    return () => {
      cleanup.then((unlisten) => unlisten());
    };
  }, []);

  const goTo = useCallback(
    async (next: View) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const leavingPanel =
          view.kind === "panel" && (next.kind !== "panel" || next.id !== view.id);
        if (leavingPanel) setPanelVisible(false);
        if (next.kind === "tile") setDockVisible(false);
        if (leavingPanel || next.kind === "tile") await wait(FADE_OUT_MS);

        // Panels take keyboard focus; the tile and dock never do (focus.rs), and
        // closing a panel hands focus back to the app the user was in.
        const wantsFocus = next.kind === "panel";
        if (wantsFocus !== (view.kind === "panel")) {
          invoke("set_focus_mode", { focus: wantsFocus }).catch((err) =>
            console.error("set_focus_mode", err),
          );
        }

        setView(next);
        const { width, height } = sizeOf(next);
        setAnchor(await morphTo(width, height));

        if (next.kind !== "tile") setDockVisible(true);
        if (next.kind === "panel") setPanelVisible(true);
      } finally {
        busy.current = false;
      }
    },
    [view],
  );

  // Widgets asking for attention. The list is fixed, so the hooks run in a stable order.
  const alerts = WIDGETS.map((w) => w.attention?.use() ?? false);
  const alertingId = WIDGETS.find((_, i) => alerts[i])?.id;

  // Opening a widget's panel is how the user acknowledges its alert.
  useEffect(() => {
    if (view.kind === "panel") findWidget(view.id)?.attention?.acknowledge();
  }, [view]);

  // Tray "Reset position": collapse to the tile, then move it back to the default spot.
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const unlisten = listen(RESET_POSITION_EVENT, async () => {
      if (viewRef.current.kind !== "tile") {
        await goToRef.current({ kind: "tile" });
        await wait(COLLAPSE_MS);
      }
      await resetOrbPosition();
    });
    return () => {
      unlisten.then((off) => off());
    };
  }, []);

  // A widget asked to get out of the way (e.g. the whiteboard started drawing).
  useEffect(() => {
    const collapse = () => {
      if (viewRef.current.kind !== "tile") goToRef.current({ kind: "tile" });
    };
    window.addEventListener(COLLAPSE_REQUEST, collapse);
    return () => window.removeEventListener(COLLAPSE_REQUEST, collapse);
  }, []);

  const onOrbClick = () => {
    if (view.kind === "tile") goTo(alertingId ? { kind: "panel", id: alertingId } : { kind: "dock" });
    else goTo({ kind: "tile" });
  };

  const onSelectWidget = (id: string) =>
    goTo(view.kind === "panel" && view.id === id ? { kind: "dock" } : { kind: "panel", id });

  // Esc steps back one level: panel -> dock -> tile.
  useEffect(() => {
    if (view.kind === "tile") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      goTo(view.kind === "panel" ? { kind: "dock" } : { kind: "tile" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, goTo]);

  const panelWidget = view.kind === "panel" ? findWidget(view.id) : undefined;
  const size = sizeOf(view);

  const shellClass = [
    "shell",
    anchor.right && "shell--right",
    anchor.bottom && "shell--bottom",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Glass>
      {/* Laid out at the target size and pinned to the tile's corner: as the window
          grows, it uncovers more of the layout rather than reflowing it. */}
      <div className={shellClass} style={{ width: size.width, height: size.height }}>
        <div className="shell__header">
          <Orb
            active={view.kind !== "tile"}
            alert={alertingId !== undefined}
            badges={TILE_BADGES.map(({ id, TileBadge }) => <TileBadge key={id} />)}
            onClick={onOrbClick}
          />
          <div className={`shell__dock${dockVisible ? " is-visible" : ""}`}>
            <Dock
              widgets={WIDGETS}
              selectedId={panelWidget?.id ?? null}
              showGlances={dockVisible}
              onSelect={onSelectWidget}
            />
          </div>
        </div>
        {panelWidget && (
          <section
            className={`shell__panel${panelVisible ? " is-visible" : ""}`}
            aria-label={panelWidget.label}
          >
            <panelWidget.Panel />
          </section>
        )}
      </div>
    </Glass>
  );
}
