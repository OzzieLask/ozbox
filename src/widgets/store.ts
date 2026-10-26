import { useSyncExternalStore } from "react";
import { load, type Store } from "@tauri-apps/plugin-store";

/** File in the app-data folder that holds every widget's saved state. */
const FILE = "widgets.json";
/** Wait for typing to pause before sending changes to the native side. */
const SAVE_DELAY_MS = 250;
/** The plugin then writes the file this long after the last change. */
const FILE_AUTOSAVE_MS = 400;

let file: Store | null = null;
const hydrators: Array<(file: Store) => Promise<void>> = [];

/** Load saved widget state from disk. Call once, before the first render. */
export async function initWidgetStorage(): Promise<void> {
  try {
    file = await load(FILE, { autoSave: FILE_AUTOSAVE_MS });
  } catch (err) {
    // Without the file the app still works; it just won't remember anything.
    console.error("widget storage unavailable", err);
    return;
  }
  await Promise.all(hydrators.map((hydrate) => hydrate(file!)));
}

type SetState<T> = (next: T | ((prev: T) => T)) => void;

export type WidgetStore<T> = {
  get: () => T;
  set: SetState<T>;
  /** React hook: current state plus a setter, like useState but shared and saved. */
  use: () => [T, SetState<T>];
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * State for one widget that lives outside any component, so its Panel and Glance
 * share it and it survives the panel closing. Changes save to disk automatically.
 * Create stores at module level (not inside components).
 *
 * `migrate` turns whatever was saved (possibly an older shape) into the current
 * one; without it, saved objects are merged over `initial` to fill in new fields.
 */
export function createWidgetStore<T>(
  key: string,
  initial: T,
  migrate?: (saved: unknown) => T,
): WidgetStore<T> {
  let state = initial;
  let saveTimer: number | undefined;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  hydrators.push(async (file) => {
    const saved = await file.get<T>(key);
    if (saved === undefined) return;
    if (migrate) state = migrate(saved);
    // Fill in fields added since the state was saved.
    else state = isPlainObject(initial) && isPlainObject(saved) ? { ...initial, ...saved } : saved;
    notify();
  });

  const set: SetState<T> = (next) => {
    state = typeof next === "function" ? (next as (prev: T) => T)(state) : next;
    notify();
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      file?.set(key, state).catch((err) => console.error(`saving ${key} failed`, err));
    }, SAVE_DELAY_MS);
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const getSnapshot = () => state;

  return {
    get: getSnapshot,
    set,
    use: () => [useSyncExternalStore(subscribe, getSnapshot), set],
  };
}
