import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Matches audio.rs. */
export type Channel = { volume: number; muted: boolean };
export type AppChannel = Channel & { key: string; name: string };
export type Mixer = { master: Channel; apps: AppChannel[] };
export type Peaks = { master: number; apps: Record<string, number> };

const MIXER_POLL_MS = 1000;
const PEAKS_POLL_MS = 80;

/** Poll a command every `ms` while `active`; null until the first answer. */
function usePolled<T>(command: string, ms: number, active: boolean): [T | null, () => void] {
  const [value, setValue] = useState<T | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const load = () =>
      invoke<T>(command)
        .then((v) => !cancelled && setValue(v))
        .catch((err) => console.error(command, err));
    load();
    const id = setInterval(load, ms);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [command, ms, active, tick]);
  return [value, () => setTick((t) => t + 1)];
}

/** Volumes for the system and each app with sound, refreshed every second. */
export function useMixer(active = true) {
  return usePolled<Mixer>("audio_mixer", MIXER_POLL_MS, active);
}

/** Live output levels for the meters; only poll while they're on screen. */
export function usePeaks(active: boolean) {
  return usePolled<Peaks>("audio_peaks", PEAKS_POLL_MS, active)[0];
}

// Dragging a slider fires many changes; send at most one at a time, always the latest.
const pending = new Map<string, { volume?: number; muted?: boolean }>();
const inFlight = new Set<string>();

export function setVolume(target: string, change: { volume?: number; muted?: boolean }) {
  pending.set(target, { ...pending.get(target), ...change });
  if (inFlight.has(target)) return;
  const send = () => {
    const next = pending.get(target);
    if (!next) {
      inFlight.delete(target);
      return;
    }
    pending.delete(target);
    inFlight.add(target);
    invoke("set_volume", { target, ...next })
      .catch((err) => console.error("set_volume", err))
      .finally(send);
  };
  send();
}

/**
 * The mixer key for a Now Playing source id: "Spotify.exe" -> "spotify",
 * "SpotifyAB.SpotifyMusic_x!Spotify" -> "spotify", "MSEdge" -> "msedge".
 */
export function mixerKeyFor(sourceId: string): string {
  const name = sourceId.split("!").pop() ?? sourceId;
  return name.replace(/\.exe$/i, "").toLowerCase();
}
