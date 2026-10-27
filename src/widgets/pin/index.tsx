import { PinIcon } from "../../ui/icons";
import type { WidgetDefinition } from "../types";
import { PinPanel } from "./PinPanel";
import { usePinnedAppCount, usePins } from "./pins";
import "./pin.css";

/** Number of pinned pages and apps on the dock icon. */
function PinGlance() {
  const count = usePins().length + usePinnedAppCount();
  return count > 0 ? <span className="glance-count">{count}</span> : null;
}

export const pinWidget: WidgetDefinition = {
  id: "pin",
  label: "Pin a page or app",
  Icon: PinIcon,
  panelSize: { width: 320, height: 248 },
  Panel: PinPanel,
  Glance: PinGlance,
};
