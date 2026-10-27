import type { WidgetDefinition } from "./types";
import { notesWidget } from "./notes";
import { timerWidget } from "./timer";
import { pinWidget } from "./pin";

/** Every widget, in dock order (nearest the OZ button first). */
export const WIDGETS: WidgetDefinition[] = [notesWidget, timerWidget, pinWidget];

export function findWidget(id: string): WidgetDefinition | undefined {
  return WIDGETS.find((w) => w.id === id);
}
