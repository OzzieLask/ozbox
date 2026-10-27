import { WhiteboardIcon } from "../../ui/icons";
import type { WidgetDefinition } from "../types";
import { useWhiteboardMode } from "./shared";
import { WhiteboardPanel } from "./WhiteboardPanel";
import "./whiteboard.css";

/** A dot on the dock icon while the whiteboard is on screen. */
function WhiteboardGlance() {
  return useWhiteboardMode() === "off" ? null : <span className="glance-dot" />;
}

export const whiteboardWidget: WidgetDefinition = {
  id: "whiteboard",
  label: "Whiteboard",
  Icon: WhiteboardIcon,
  panelSize: { width: 300, height: 150 },
  Panel: WhiteboardPanel,
  Glance: WhiteboardGlance,
};
