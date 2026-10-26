import { useState } from "react";
import { useTicker } from "../useTicker";
import {
  elapsed,
  formatTime,
  isRunning,
  parseDuration,
  pause,
  PRESET_MINUTES,
  remaining,
  reset,
  setDuration,
  setMode,
  start,
  type TimerMode,
  timerStore,
} from "./model";

const MODES: { id: TimerMode; label: string }[] = [
  { id: "countdown", label: "Countdown" },
  { id: "stopwatch", label: "Stopwatch" },
];

export function TimerPanel() {
  const [state] = timerStore.use();
  const { mode } = state;
  const clock = state[mode];
  const running = isRunning(clock);
  const now = useTicker(running, 250);

  const isCountdown = mode === "countdown";
  const left = remaining(state, now);
  const done = isCountdown && left === 0;
  const started = elapsed(clock, now) > 0;
  const display = isCountdown ? formatTime(left, "up") : formatTime(elapsed(clock, now), "down");
  const progress = isCountdown ? 1 - left / state.durationMs : 0;

  const primaryLabel = running ? "Pause" : done ? "Restart" : started ? "Resume" : "Start";

  return (
    <div className="timer">
      <div className="timer__modes" role="tablist">
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={mode === id}
            className={`timer__mode${mode === id ? " is-active" : ""}`}
            onClick={() => setMode(id)}
          >
            {label}
            {id !== mode && isRunning(state[id]) && <span className="timer__mode-dot" />}
          </button>
        ))}
      </div>

      <div className={`timer__display${done ? " is-done" : ""}${!running && started && !done ? " is-paused" : ""}`}>
        {done ? "Time's up" : display}
      </div>

      {isCountdown && (
        <>
          <div className="timer__progress" aria-hidden>
            <div className="timer__progress-fill" style={{ transform: `scaleX(${progress})` }} />
          </div>
          <DurationPicker durationMs={state.durationMs} disabled={running} />
        </>
      )}

      <div className="timer__controls">
        <button
          className="timer__button timer__button--primary"
          onClick={() => (running ? pause(mode) : start(mode))}
        >
          {primaryLabel}
        </button>
        <button className="timer__button" onClick={() => reset(mode)} disabled={!started && !running}>
          Reset
        </button>
      </div>
    </div>
  );
}

function DurationPicker({ durationMs, disabled }: { durationMs: number; disabled: boolean }) {
  const [custom, setCustom] = useState("");
  const parsed = parseDuration(custom);
  const isPreset = PRESET_MINUTES.some((m) => m * 60_000 === durationMs);

  const applyCustom = () => {
    if (parsed === null) return;
    setDuration(parsed);
    setCustom("");
  };

  return (
    <div className="timer__presets">
      {PRESET_MINUTES.map((m) => (
        <button
          key={m}
          className={`timer__chip${durationMs === m * 60_000 ? " is-active" : ""}`}
          disabled={disabled}
          onClick={() => setDuration(m * 60_000)}
        >
          {m}m
        </button>
      ))}
      <input
        className={`timer__custom${!isPreset && !custom ? " is-active" : ""}${custom && parsed === null ? " is-invalid" : ""}`}
        placeholder={isPreset ? "mm:ss" : formatTime(durationMs, "up")}
        title="Custom time: 12, 12:30 or 1:00:00 — Enter to set"
        value={custom}
        disabled={disabled}
        onChange={(e) => setCustom(e.target.value)}
        onBlur={applyCustom}
        onKeyDown={(e) => {
          if (e.key === "Enter") applyCustom();
        }}
      />
    </div>
  );
}
