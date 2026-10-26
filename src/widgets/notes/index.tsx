import { NotesIcon } from "../../ui/icons";
import type { WidgetDefinition } from "../types";
import { countOpenTasks, hasContent, notesStore } from "./model";
import { NotesPanel } from "./NotesPanel";
import "./notes.css";

/** On the dock icon: open checklist items across all tabs, or a dot if there's any text. */
function NotesGlance() {
  const [{ tabs }] = notesStore.use();
  const open = tabs.reduce((n, t) => n + countOpenTasks(t.doc), 0);
  if (open > 0) return <span className="glance-count">{open > 99 ? "99+" : open}</span>;
  return tabs.some((t) => hasContent(t.doc)) ? <span className="glance-dot" /> : null;
}

export const notesWidget: WidgetDefinition = {
  id: "notes",
  label: "Notes",
  Icon: NotesIcon,
  panelSize: { width: 320, height: 340 },
  Panel: NotesPanel,
  Glance: NotesGlance,
};
