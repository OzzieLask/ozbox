import type { JSONContent } from "@tiptap/react";
import { createWidgetStore } from "../store";

export const MAX_TABS = 5;

export type NoteTab = {
  id: string;
  title: string;
  /** Tiptap document JSON; null until something is written. */
  doc: JSONContent | null;
};

export type NotesState = {
  tabs: NoteTab[];
  activeId: string;
};

function newTab(title: string, doc: JSONContent | null = null): NoteTab {
  return { id: crypto.randomUUID(), title, doc };
}

function initialState(): NotesState {
  const tab = newTab("Notes");
  return { tabs: [tab], activeId: tab.id };
}

/** Plain text (one paragraph per line) as a Tiptap document. */
function textToDoc(text: string): JSONContent {
  return {
    type: "doc",
    content: text.split("\n").map((line) =>
      line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
    ),
  };
}

function migrate(saved: unknown): NotesState {
  const s = saved as Partial<NotesState> & { text?: unknown };
  if (Array.isArray(s.tabs) && s.tabs.length > 0) {
    const activeId = s.tabs.some((t) => t.id === s.activeId) ? s.activeId! : s.tabs[0].id;
    return { tabs: s.tabs, activeId };
  }
  // Phase 3 saved a single plain-text box as { text }.
  if (typeof s.text === "string" && s.text.trim()) {
    const tab = newTab("Notes", textToDoc(s.text));
    return { tabs: [tab], activeId: tab.id };
  }
  return initialState();
}

export const notesStore = createWidgetStore<NotesState>("notes", initialState(), migrate);

export function updateTab(id: string, patch: Partial<Omit<NoteTab, "id">>) {
  notesStore.set((s) => ({
    ...s,
    tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  }));
}

export function addTab() {
  notesStore.set((s) => {
    if (s.tabs.length >= MAX_TABS) return s;
    const tab = newTab(`Note ${s.tabs.length + 1}`);
    return { tabs: [...s.tabs, tab], activeId: tab.id };
  });
}

export function removeTab(id: string) {
  notesStore.set((s) => {
    if (s.tabs.length <= 1) return s;
    const index = s.tabs.findIndex((t) => t.id === id);
    const tabs = s.tabs.filter((t) => t.id !== id);
    const activeId = s.activeId === id ? tabs[Math.max(0, index - 1)].id : s.activeId;
    return { tabs, activeId };
  });
}

export function selectTab(id: string) {
  notesStore.set((s) => ({ ...s, activeId: id }));
}

/** True if the document has any text or checklist items. */
export function hasContent(doc: JSONContent | null): boolean {
  if (!doc) return false;
  if (doc.type === "text" && doc.text?.trim()) return true;
  if (doc.type === "taskItem") return true;
  return doc.content?.some(hasContent) ?? false;
}

/** Number of unchecked checklist items in a document. */
export function countOpenTasks(doc: JSONContent | null): number {
  if (!doc) return 0;
  const own = doc.type === "taskItem" && !doc.attrs?.checked ? 1 : 0;
  return own + (doc.content?.reduce((n, child) => n + countOpenTasks(child), 0) ?? 0);
}
