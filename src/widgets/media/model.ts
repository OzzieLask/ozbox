import { useEffect, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Matches media.rs. */
export type Source = { id: string; app: string };
export type Track = {
  source: Source;
  title: string;
  artist: string;
  album: string;
  art: string | null;
  playing: boolean;
  position_ms: number;
  duration_ms: number;
  measured_at_ms: number;
  can_previous: boolean;
  can_next: boolean;
  can_seek: boolean;
};
export type NowPlaying = { sources: Source[]; track: Track | null };

const POLL_MS = 1000;

// Shared by the panel and the dock glance, and only polled while one is on screen.
let state: NowPlaying = { sources: [], track: null };
/** The source the user picked; null follows Windows' current one. */
let chosen: string | null = null;
const listeners = new Set<() => void>();
let watchers = 0;
let timer: number | undefined;

async function refresh() {
  try {
    state = await invoke<NowPlaying>("now_playing", { source: chosen });
  } catch (err) {
    console.error("now_playing", err);
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current media state, refreshed every second while any component is using it. */
export function useNowPlaying(): NowPlaying {
  useEffect(() => {
    if (watchers++ === 0) {
      refresh();
      timer = window.setInterval(refresh, POLL_MS);
    }
    return () => {
      if (--watchers === 0) clearInterval(timer);
    };
  }, []);
  return useSyncExternalStore(subscribe, () => state);
}

export function chooseSource(id: string) {
  chosen = id;
  refresh();
}

export async function control(action: "toggle" | "next" | "previous" | "seek", positionMs?: number) {
  await invoke("media_control", { source: state.track?.source.id ?? chosen, action, positionMs });
  // Apps take a moment to apply the change; refresh soon after.
  setTimeout(refresh, 150);
}

/** Where playback is now, advancing the last reported position while playing. */
export function livePosition(track: Track, now: number): number {
  const position = track.playing ? track.position_ms + (now - track.measured_at_ms) : track.position_ms;
  return track.duration_ms > 0 ? Math.min(Math.max(0, position), track.duration_ms) : Math.max(0, position);
}

/** 83000 -> "1:23". */
export function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
