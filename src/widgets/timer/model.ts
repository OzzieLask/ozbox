import { createWidgetStore } from "../store";

export type TimerMode = "countdown" | "stopwatch";

/**
 * A pausable clock stored as timestamps rather than a running count, so it keeps
 * time while the app is closed and can't drift.
 */
export type Clock = {
  /** When it was last started (epoch ms), or null while stopped/paused. */
  startedAt: number | null;
  /** Time accumulated before the current run. */
  elapsedBefore: number;
};

export type TimerState = {
  mode: TimerMode;
  durationMs: number;
  countdown: Clock;
  stopwatch: Clock;
  /** A countdown finished and the user hasn't looked yet. */
  alerting: boolean;
};

export const PRESET_MINUTES = [5, 15, 25, 45];
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

const stopped: Clock = { startedAt: null, elapsedBefore: 0 };

export const timerStore = createWidgetStore<TimerState>("timer", {
  mode: "countdown",
  durationMs: 25 * 60 * 1000,
  countdown: stopped,
  stopwatch: stopped,
  alerting: false,
});

// ---- Derived values ----

export const isRunning = (clock: Clock) => clock.startedAt !== null;

export function elapsed(clock: Clock, now: number): number {
  return clock.elapsedBefore + (clock.startedAt !== null ? now - clock.startedAt : 0);
}

export function remaining(state: TimerState, now: number): number {
  return Math.max(0, state.durationMs - elapsed(state.countdown, now));
}

/** "4:05" or "1:04:05". */
export function formatTime(ms: number, round: "up" | "down"): string {
  const total = round === "up" ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Parse "12" (minutes), "12:30" (m:s) or "1:02:03" (h:m:s). Null if invalid. */
export function parseDuration(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const [h, m, s] =
    nums.length === 1 ? [0, nums[0], 0] : nums.length === 2 ? [0, nums[0], nums[1]] : nums;
  const ms = ((h * 60 + m) * 60 + s) * 1000;
  return ms > 0 && ms <= MAX_DURATION_MS ? ms : null;
}

// ---- Actions ----

function updateClock(mode: TimerMode, fn: (clock: Clock, s: TimerState) => Clock) {
  timerStore.set((s) => ({ ...s, [mode]: fn(s[mode], s) }));
}

export function setMode(mode: TimerMode) {
  timerStore.set((s) => ({ ...s, mode }));
}

export function start(mode: TimerMode) {
  const now = Date.now();
  updateClock(mode, (clock, s) => {
    // Starting a finished countdown starts it over.
    const done = mode === "countdown" && remaining(s, now) === 0;
    return { startedAt: now, elapsedBefore: done ? 0 : clock.elapsedBefore };
  });
  if (mode === "countdown") acknowledge();
}

export function pause(mode: TimerMode) {
  const now = Date.now();
  updateClock(mode, (clock) => ({ startedAt: null, elapsedBefore: elapsed(clock, now) }));
}

export function reset(mode: TimerMode) {
  updateClock(mode, () => stopped);
  if (mode === "countdown") acknowledge();
}

export function setDuration(ms: number) {
  timerStore.set((s) => ({ ...s, durationMs: ms, countdown: stopped, alerting: false }));
}

export function acknowledge() {
  if (timerStore.get().alerting) timerStore.set((s) => ({ ...s, alerting: false }));
}

// ---- Finishing ----

// One timeout for the moment the running countdown ends, so it finishes (and the
// tile pulses) even when no timer UI is on screen. Rescheduled after every change,
// including when saved state loads at startup.
let finishTimer: number | undefined;

function scheduleFinish() {
  clearTimeout(finishTimer);
  const s = timerStore.get();
  if (!isRunning(s.countdown)) return;
  const left = remaining(s, Date.now());
  if (left > 0) {
    finishTimer = window.setTimeout(scheduleFinish, left);
    return;
  }
  timerStore.set((s) => ({
    ...s,
    countdown: { startedAt: null, elapsedBefore: s.durationMs },
    alerting: true,
  }));
}

timerStore.subscribe(scheduleFinish);
