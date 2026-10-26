import { TimerIcon } from "../../ui/icons";
import type { WidgetDefinition } from "../types";

// Placeholder until Phase 5 (start / pause / reset, saved state).
function TimerPanel() {
  return <p className="widget-placeholder">The timer arrives in Phase 5.</p>;
}

export const timerWidget: WidgetDefinition = {
  id: "timer",
  label: "Timer",
  Icon: TimerIcon,
  panelSize: { width: 240, height: 150 },
  Panel: TimerPanel,
};
