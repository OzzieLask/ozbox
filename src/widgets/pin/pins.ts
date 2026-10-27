import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createWidgetStore } from "../store";

/** Matches pin.rs. */
export const PINS_CHANGED_EVENT = "ozbox://pins-changed";
/** Matches drop.rs. */
export const FILES_DROPPED_EVENT = "ozbox://files-dropped";
const DROP_MESSAGE = "ozbox-drop-files";

/** File types a pin can show. Keep in sync with VIEWABLE_EXTENSIONS in pin.rs. */
export const VIEWABLE_EXTENSIONS = [
  "pdf", "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "svg", "mp4", "webm",
  "m4v", "mov", "mp3", "wav", "ogg", "m4a", "flac", "txt", "log", "json", "csv", "xml",
  "html", "htm", "css", "js",
];

export type PinInfo = { id: number; url: string; title: string };

// Open pins live in Rust (they're windows); mirror them here and refresh on changes.
let pins: PinInfo[] = [];
let pinnedAppCount = 0;
const listeners = new Set<() => void>();

async function refresh() {
  try {
    [pins, pinnedAppCount] = await Promise.all([
      invoke<PinInfo[]>("list_pins"),
      invoke<number>("pinned_app_count"),
    ]);
    listeners.forEach((listener) => listener());
  } catch (err) {
    console.error("refresh pins", err);
  }
}

listen(PINS_CHANGED_EVENT, refresh);
refresh();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePins(): PinInfo[] {
  return useSyncExternalStore(subscribe, () => pins);
}

/** App windows OzBox is keeping on top. */
export function usePinnedAppCount(): number {
  return useSyncExternalStore(subscribe, () => pinnedAppCount);
}

/** Re-check, e.g. after a pinned app may have closed. */
export const refreshPins = refresh;

// ---- App windows ----

export type AppWindow = { id: number; title: string; app: string; on_top: boolean };

export const listAppWindows = () => invoke<AppWindow[]>("list_app_windows");
export const setAppOnTop = (id: number, onTop: boolean) =>
  invoke("set_app_on_top", { id, onTop });

export const openPin = (url: string) => invoke<number>("open_pin", { url });
export const pinFile = (path: string) => invoke<number>("pin_file", { path });
export const closePin = (id: number) => invoke("close_pin", { id });

/**
 * Turn what was typed into a URL: full URLs pass through, "youtube.com" gets
 * https://, and anything else becomes a web search.
 */
export function toUrl(input: string): string {
  const text = input.trim();
  if (/^https?:\/\//i.test(text)) return text;
  if (!/\s/.test(text) && /\.[a-z]{2,}(\/|$|:)/i.test(text)) return `https://${text}`;
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

/** "www.youtube.com" -> "youtube.com", for display. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---- Shortcut tabs (saved) ----

export type Shortcut = { id: string; label: string; url: string };

const shortcut = (label: string, url: string): Shortcut => ({ id: crypto.randomUUID(), label, url });

export const shortcutsStore = createWidgetStore("pin", {
  shortcuts: [
    shortcut("YouTube", "https://www.youtube.com"),
    shortcut("Claude", "https://claude.ai"),
    shortcut("ChatGPT", "https://chatgpt.com"),
    shortcut("Google", "https://www.google.com"),
  ],
});

/** A short name for a site: "https://docs.github.com/x" -> "Github". */
export function labelFor(url: string): string {
  const parts = hostOf(url).split(".");
  const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  return name ? name[0].toUpperCase() + name.slice(1) : "Link";
}

export function addShortcut(url: string) {
  shortcutsStore.set((s) => ({ shortcuts: [...s.shortcuts, shortcut(labelFor(url), url)] }));
}

export function removeShortcut(id: string) {
  shortcutsStore.set((s) => ({ shortcuts: s.shortcuts.filter((x) => x.id !== id) }));
}

export function renameShortcut(id: string, label: string) {
  shortcutsStore.set((s) => ({
    shortcuts: s.shortcuts.map((x) => (x.id === id ? { ...x, label } : x)),
  }));
}

// ---- Drag and drop ----

/** The link in a drop from a browser (address bar, a link, or dragged text that's a URL). */
export function linkFromDrop(data: DataTransfer): string | null {
  const uriList = data.getData("text/uri-list");
  const fromList = uriList.split(/\r?\n/).find((line) => line && !line.startsWith("#"));
  const text = fromList ?? data.getData("text/plain").trim();
  return /^https?:\/\//i.test(text) ? text : null;
}

type WebView2Bridge = {
  postMessageWithAdditionalObjects: (message: string, objects: FileList) => void;
};

/**
 * Hand dropped files to the native side, which reads their real paths (drop.rs)
 * and answers with FILES_DROPPED_EVENT.
 */
export function sendDroppedFiles(files: FileList): boolean {
  const bridge = (window as unknown as { chrome?: { webview?: WebView2Bridge } }).chrome?.webview;
  if (!bridge || files.length === 0) return false;
  bridge.postMessageWithAdditionalObjects(DROP_MESSAGE, files);
  return true;
}
