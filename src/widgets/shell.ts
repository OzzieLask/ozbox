/**
 * Requests a widget can make of the OzBox shell (App.tsx listens). Kept as DOM
 * events so widgets don't depend on the shell's internals.
 */
export const COLLAPSE_REQUEST = "ozbox-collapse";

/** Fold OzBox back to the tile, e.g. so it doesn't sit over something the user opened. */
export function requestCollapse() {
  window.dispatchEvent(new Event(COLLAPSE_REQUEST));
}
