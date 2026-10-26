import { TimerIcon } from "../../ui/icons";
import type { WidgetDefinition } from "../types";
import { useTicker } from "../useTicker";
import { acknowledge, elapsed, formatTime, isRunning, remaining, timerStore } from "./model";
import { TimerPanel } from "./TimerPanel";
import "./timer.css";

/** Time badge on the dock icon: the countdown if it's in use, otherwise the stopwatch. */
function TimerGlance() {
  const [state] = timerStore.use();
  const { countdown, stopwatch } = state;
  const now = useTicker(isRunning(countdown) || isRunning(stopwatch), 500);

  if (state.alerting) return <span className="glance-time is-alert">Done</span>;

  // Running, or paused part-way (a finished, already-seen countdown shows nothing).
  const countdownInUse =
    isRunning(countdown) || (countdown.elapsedBefore > 0 && remaining(state, now) > 0);
  const clock = countdownInUse ? countdown : stopwatch;
  if (!countdownInUse && !isRunning(stopwatch) && stopwatch.elapsedBefore === 0) return null;

  const text = countdownInUse
    ? formatTime(remaining(state, now), "up")
    : formatTime(elapsed(stopwatch, now), "down");
  return <span className={`glance-time${isRunning(clock) ? "" : " is-paused"}`}>{text}</span>;
}

export const timerWidget: WidgetDefinition = {
  id: "timer",
  label: "Timer",
  Icon: TimerIcon,
  panelSize: { width: 260, height: 214 },
  Panel: TimerPanel,
  Glance: TimerGlance,
  attention: {
    use: () => timerStore.use()[0].alerting,
    acknowledge,
  },
};
