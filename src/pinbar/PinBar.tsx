import { closePin, hostOf, usePins } from "../widgets/pin/pins";

/** The glass bar on top of a pinned page: drag to move, × to close. */
export function PinBar({ id }: { id: number }) {
  const pin = usePins().find((p) => p.id === id);

  return (
    <div className="pinbar" data-tauri-drag-region>
      <span className="pinbar__title" data-tauri-drag-region title={pin?.url}>
        {pin?.title ?? ""}
        {pin?.url.startsWith("http") && <span className="pinbar__host"> · {hostOf(pin.url)}</span>}
      </span>
      <button
        className="pinbar__button pinbar__button--close"
        aria-label="Close pin"
        title="Close"
        onClick={() => closePin(id)}
      >
        ×
      </button>
    </div>
  );
}
