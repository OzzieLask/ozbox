import type { ComponentType } from "react";

/**
 * Everything OzBox needs to know about a widget. To add one: create a folder under
 * src/widgets/, export a definition like this, and list it in registry.ts.
 */
export type WidgetDefinition = {
  /** Stable id; also used as its storage key, so don't rename it once shipped. */
  id: string;
  /** Shown as the dock tooltip and accessible name. */
  label: string;
  /** 20px line icon for the dock. */
  Icon: ComponentType;
  /** Size of the panel area below the dock strip, in logical px. */
  panelSize: { width: number; height: number };
  /** The widget's full view, shown when its dock icon is selected. */
  Panel: ComponentType;
  /** Optional live badge drawn over the dock icon, e.g. a running timer's time. */
  Glance?: ComponentType;
  /**
   * Optional sign on the OZ tile itself, visible even when OzBox is collapsed
   * (e.g. "the whiteboard is on"). Rendered over the whole tile, so it can place a
   * corner badge or draw a ring; return null when there's nothing to show.
   */
  TileBadge?: ComponentType;
  /**
   * Optional way to ask for the user's attention (e.g. a finished timer). While
   * `use()` is true the OZ tile pulses; clicking it opens this widget's panel, and
   * opening the panel calls `acknowledge()`.
   */
  attention?: {
    use: () => boolean;
    acknowledge: () => void;
  };
};
