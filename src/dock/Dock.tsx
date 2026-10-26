import type { ComponentType } from "react";
import { NotesIcon, TimerIcon } from "./icons";
import "./Dock.css";

export type DockItem = {
  id: string;
  label: string;
  Icon: ComponentType;
};

// Placeholder list until Phase 3 turns widgets into pluggable modules.
export const DOCK_ITEMS: DockItem[] = [
  { id: "notes", label: "Notes", Icon: NotesIcon },
  { id: "timer", label: "Timer", Icon: TimerIcon },
];

/** Logical px each dock item takes up (button + gap). Keep in sync with Dock.css. */
export const DOCK_ITEM_SIZE = 44;
/** Logical px of the divider and end padding beside the OZ button. */
export const DOCK_PADDING = 14;

type DockProps = {
  items: DockItem[];
  onSelect: (id: string) => void;
};

export function Dock({ items, onSelect }: DockProps) {
  return (
    <div className="dock">
      <div className="dock__divider" aria-hidden />
      {items.map(({ id, label, Icon }) => (
        <button key={id} className="dock__item" title={label} aria-label={label} onClick={() => onSelect(id)}>
          <Icon />
        </button>
      ))}
    </div>
  );
}
