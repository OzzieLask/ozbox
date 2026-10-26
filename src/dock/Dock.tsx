import type { WidgetDefinition } from "../widgets/types";
import "./Dock.css";

/** Logical px each dock item takes up (button + gap). Keep in sync with Dock.css. */
export const DOCK_ITEM_SIZE = 44;
/** Logical px of the divider and end padding beside the OZ button. */
export const DOCK_PADDING = 14;

type DockProps = {
  widgets: WidgetDefinition[];
  selectedId: string | null;
  /** Glances tick while shown; skip them while the dock is hidden. */
  showGlances: boolean;
  onSelect: (id: string) => void;
};

export function Dock({ widgets, selectedId, showGlances, onSelect }: DockProps) {
  return (
    <div className="dock">
      <div className="dock__divider" aria-hidden />
      {widgets.map(({ id, label, Icon, Glance }) => (
        <button
          key={id}
          className={`dock__item${id === selectedId ? " dock__item--selected" : ""}`}
          title={label}
          aria-label={label}
          aria-pressed={id === selectedId}
          onClick={() => onSelect(id)}
        >
          <Icon />
          {Glance && showGlances && (
            <span className="dock__glance">
              <Glance />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
