import {
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import { currentAnchor, TILE_SIZE } from "./morph";

const STORAGE_KEY = "ozbox.orb.position";
const EDGE_MARGIN = 16; // logical px from the screen edge
const SAVE_DELAY_MS = 300;

type Point = { x: number; y: number };

function loadSaved(): Point | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Point) : null;
  } catch {
    return null;
  }
}

// True if the window's center would land inside some monitor's usable area.
async function isOnScreen(pos: Point): Promise<boolean> {
  const size = await getCurrentWindow().outerSize();
  const cx = pos.x + size.width / 2;
  const cy = pos.y + size.height / 2;
  return (await availableMonitors()).some(({ workArea: { position: p, size: s } }) =>
    cx >= p.x && cx < p.x + s.width && cy >= p.y && cy < p.y + s.height,
  );
}

// Right edge, vertically centered, on the monitor the window opened on.
async function defaultPosition(): Promise<Point> {
  const monitor = await currentMonitor();
  const size = await getCurrentWindow().outerSize();
  if (!monitor) return { x: 0, y: 0 };
  const { position: p, size: s } = monitor.workArea;
  return {
    x: p.x + s.width - size.width - Math.round(EDGE_MARGIN * monitor.scaleFactor),
    y: p.y + Math.round((s.height - size.height) / 2),
  };
}

/** Move the orb to its saved (or default) spot, show it, and start remembering moves. */
export async function placeOrbWindow(): Promise<() => void> {
  const win = getCurrentWindow();

  const saved = loadSaved();
  const pos = saved && (await isOnScreen(saved)) ? saved : await defaultPosition();
  await win.setPosition(new PhysicalPosition(pos.x, pos.y));
  await win.show();

  // Moved fires continuously while dragging or morphing; only save once it settles.
  let timer: number | undefined;
  return win.onMoved(({ payload }) => {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      // Save where the tile is, not the window: when expanded, the tile sits in the
      // anchored corner, so the app always relaunches collapsed in the right spot.
      const [size, scale] = await Promise.all([win.outerSize(), win.scaleFactor()]);
      const tile = Math.round(TILE_SIZE * scale);
      const { right, bottom } = currentAnchor();
      const pos = {
        x: right ? payload.x + size.width - tile : payload.x,
        y: bottom ? payload.y + size.height - tile : payload.y,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    }, SAVE_DELAY_MS);
  });
}
