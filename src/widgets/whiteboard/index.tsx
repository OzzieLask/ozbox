import type { ReactNode } from "react";
import { WhiteboardIcon } from "../../ui/icons";
import type { WidgetDefinition } from "../types";
import { type Mode, useHasDrawing, useWhiteboardMode } from "./shared";
import { ModeMark } from "./ModeMark";
import { WhiteboardPanel } from "./WhiteboardPanel";
import "./whiteboard.css";

function badge(mode: Mode, hasDrawing: boolean, className: string): ReactNode {
  if (mode !== "off") {
    return (
      <span className={`${className} ${className}--${mode}`} title={mode === "draw" ? "Drawing" : "Drawings on screen"}>
        <ModeMark mode={mode} />
      </span>
    );
  }
  return hasDrawing ? <span className={`${className} ${className}--saved`} title="A drawing is saved" /> : null;
}

/** On the OZ tile: a glow plus pen/eye badge while on; a small dot if a drawing is saved. */
function WhiteboardTileBadge() {
  const mode = useWhiteboardMode();
  const hasDrawing = useHasDrawing();
  return (
    <>
      {mode !== "off" && <span className={`wb-tile-ring wb-tile-ring--${mode}`} />}
      {badge(mode, hasDrawing, "wb-tile-badge")}
    </>
  );
}

/** On the dock icon: the same signals, smaller. */
function WhiteboardGlance() {
  return <>{badge(useWhiteboardMode(), useHasDrawing(), "wb-glance")}</>;
}

export const whiteboardWidget: WidgetDefinition = {
  id: "whiteboard",
  label: "Whiteboard",
  Icon: WhiteboardIcon,
  panelSize: { width: 300, height: 176 },
  Panel: WhiteboardPanel,
  Glance: WhiteboardGlance,
  TileBadge: WhiteboardTileBadge,
};
