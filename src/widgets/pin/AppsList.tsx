import { useCallback, useEffect, useState } from "react";
import { type AppWindow, listAppWindows, refreshPins, setAppOnTop } from "./pins";

/** Your open windows, most recently used first, each with a keep-on-top toggle. */
export function AppsList() {
  const [windows, setWindows] = useState<AppWindow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setWindows(await listAppWindows());
      refreshPins(); // forget pinned windows that have closed
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    load();
    // The list goes stale as windows open and close; refresh when OzBox regains focus.
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  const toggle = async (w: AppWindow) => {
    setError(null);
    try {
      await setAppOnTop(w.id, !w.on_top);
    } catch (err) {
      setError(String(err));
    }
    load();
  };

  return (
    <div className="pin-apps">
      <div className="pin-apps__header">
        <span>Keep a window above everything else</span>
        <button className="pin-apps__refresh" title="Refresh list" aria-label="Refresh list" onClick={load}>
          ↻
        </button>
      </div>
      {error && <p className="pin__error">{error}</p>}
      <div className="pin__list">
        {windows?.length === 0 && <p className="pin__empty">No other windows are open.</p>}
        {windows?.map((w) => (
          <div key={w.id} className={`pin__row${w.on_top ? " is-on-top" : ""}`}>
            <span className="pin__row-title" title={w.title}>
              {w.title}
              {w.app && <span className="pin__row-host"> · {w.app}</span>}
            </span>
            <button
              className="pin-apps__toggle"
              aria-pressed={w.on_top}
              title={w.on_top ? "Stop keeping on top" : "Keep on top"}
              onClick={() => toggle(w)}
            >
              {w.on_top ? "On top" : "Pin"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
