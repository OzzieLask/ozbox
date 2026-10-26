import { NotesIcon } from "../../ui/icons";
import { createWidgetStore } from "../store";
import type { WidgetDefinition } from "../types";
import "./notes.css";

// Placeholder until Phase 4 (rich text, checklists): a plain autosaving text box.
const notesStore = createWidgetStore("notes", { text: "" });

function NotesPanel() {
  const [notes, setNotes] = notesStore.use();
  return (
    <textarea
      className="notes-scratch"
      value={notes.text}
      onChange={(e) => setNotes({ text: e.target.value })}
      placeholder="Jot something down…"
      spellCheck={false}
      autoFocus
    />
  );
}

/** A dot on the dock icon when there's something written down. */
function NotesGlance() {
  const [notes] = notesStore.use();
  return notes.text.trim() ? <span className="glance-dot" /> : null;
}

export const notesWidget: WidgetDefinition = {
  id: "notes",
  label: "Notes",
  Icon: NotesIcon,
  panelSize: { width: 300, height: 280 },
  Panel: NotesPanel,
  Glance: NotesGlance,
};
