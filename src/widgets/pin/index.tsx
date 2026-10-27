import { PinIcon } from "../../ui/icons";
import type { WidgetDefinition } from "../types";
import { PinPanel } from "./PinPanel";
import { usePins } from "./pins";
import "./pin.css";

/** Number of open pins on the dock icon. */
function PinGlance() {
  const count = usePins().length;
  return count > 0 ? <span className="glance-count">{count}</span> : null;
}

export const pinWidget: WidgetDefinition = {
  id: "pin",
  label: "Pin a page",
  Icon: PinIcon,
  panelSize: { width: 320, height: 214 },
  Panel: PinPanel,
  Glance: PinGlance,
};
