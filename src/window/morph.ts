import { invoke } from "@tauri-apps/api/core";

/** Collapsed tile size in logical px; matches the window size in tauri.conf.json. */
export const TILE_SIZE = 56;

/** Which window edges stay fixed while it grows (the tile's corner). */
export type Anchor = { right: boolean; bottom: boolean };

let anchor: Anchor = { right: false, bottom: false };

/** The anchor from the most recent morph, used to locate the tile inside a larger window. */
export function currentAnchor(): Anchor {
  return anchor;
}

/** Animate the window to the given logical size. Resolves once the animation has started. */
export async function morphTo(width: number, height: number): Promise<Anchor> {
  anchor = await invoke<Anchor>("morph", { width, height });
  return anchor;
}
