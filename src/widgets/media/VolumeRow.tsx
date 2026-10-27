import { useState } from "react";
import { SpeakerIcon } from "../../ui/icons";
import { setVolume } from "./audio";

type VolumeRowProps = {
  /** "master" or an app's mixer key. */
  target: string;
  label?: string;
  volume: number;
  muted: boolean;
  /** Live level 0–1 for the meter, if shown. */
  peak?: number;
};

/** Mute toggle, volume slider and percentage, with an optional live level meter. */
export function VolumeRow({ target, label, volume, muted, peak }: VolumeRowProps) {
  // While dragging, show the thumb where the user has it rather than the last polled value.
  const [dragValue, setDragValue] = useState<number | null>(null);
  // Muting or unmuting shows immediately; the next poll confirms it.
  const [mutedOverride, setMutedOverride] = useState<boolean | null>(null);
  const shownVolume = dragValue ?? volume;
  const shownMuted = mutedOverride ?? muted;

  return (
    <div className={`volume${shownMuted ? " is-muted" : ""}`}>
      {label && (
        <span className="volume__label" title={label}>
          {label}
        </span>
      )}
      <div className="volume__controls">
        <button
          className="volume__mute"
          aria-label={shownMuted ? "Unmute" : "Mute"}
          title={shownMuted ? "Unmute" : "Mute"}
          onClick={() => {
            setMutedOverride(!shownMuted);
            setVolume(target, { muted: !shownMuted });
            setTimeout(() => setMutedOverride(null), 1500);
          }}
        >
          <SpeakerIcon muted={shownMuted} level={shownVolume} />
        </button>
        <div className="volume__track">
          <input
            type="range"
            className="volume__slider"
            min={0}
            max={100}
            value={Math.round(shownVolume * 100)}
            style={{ "--fill": `${shownVolume * 100}%` } as React.CSSProperties}
            aria-label={`${label ?? "Volume"} volume`}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              setDragValue(v);
              setVolume(target, { volume: v, ...(shownMuted && v > 0 ? { muted: false } : {}) });
            }}
            onPointerUp={() => setTimeout(() => setDragValue(null), 1200)}
            onKeyUp={() => setTimeout(() => setDragValue(null), 1200)}
          />
          {peak !== undefined && (
            <div className="volume__meter" aria-hidden>
              {/* Square root: raw peaks are amplitude, which reads too quiet on a linear bar. */}
              <div style={{ transform: `scaleX(${shownMuted ? 0 : Math.min(1, Math.sqrt(peak))})` }} />
            </div>
          )}
        </div>
        <span className="volume__value">{Math.round(shownVolume * 100)}</span>
      </div>
    </div>
  );
}
