import { EditorContent, Extension, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChecklistIcon } from "../../ui/icons";
import { notesStore, updateTab } from "./model";
import { TabBar } from "./TabBar";

/** Tab / Shift+Tab nest and un-nest list items; outside a list, Tab stays in the editor. */
const ListIndent = Extension.create({
  name: "listIndent",
  priority: 1000, // run before the default handlers
  addKeyboardShortcuts() {
    // Read `commands` per keypress: it's bound to the editor state at access time.
    return {
      Tab: ({ editor }) =>
        editor.commands.sinkListItem("taskItem") || editor.commands.sinkListItem("listItem") || true,
      "Shift-Tab": ({ editor }) =>
        editor.commands.liftListItem("taskItem") || editor.commands.liftListItem("listItem") || true,
    };
  },
});

const extensions = [
  ListIndent,
  StarterKit.configure({
    heading: { levels: [1, 2] },
    // Kept light on purpose: OzBox is for quick capture, not documents.
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: { autolink: true, linkOnPaste: true, openOnClick: false },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder.configure({ placeholder: "Jot something down…   [ ] makes a checkbox" }),
];

export function NotesPanel() {
  const [{ tabs, activeId }] = notesStore.use();
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  // One editor per tab: switching tabs builds a fresh editor from that tab's document.
  const editor = useEditor(
    {
      extensions,
      content: active.doc ?? "",
      autofocus: "end",
      shouldRerenderOnTransaction: false,
      onUpdate: ({ editor }) => updateTab(active.id, { doc: editor.getJSON() }),
      editorProps: {
        // Ctrl+click opens a link in the browser; a plain click just places the cursor.
        handleClick: (_view, _pos, event) => {
          const link = (event.target as HTMLElement).closest("a");
          if (!link?.href || !(event.ctrlKey || event.metaKey)) return false;
          openUrl(link.href).catch((err) => console.error("open link failed", err));
          return true;
        },
      },
    },
    [active.id],
  );

  const inChecklist = useEditorState({
    editor,
    selector: ({ editor }) => editor?.isActive("taskList") ?? false,
  });

  return (
    <div className="notes">
      <div className="notes__bar">
        <TabBar tabs={tabs} activeId={active.id} />
        <button
          className={`notes__tool${inChecklist ? " is-active" : ""}`}
          title="Checklist  ( [ ] )"
          aria-label="Toggle checklist"
          aria-pressed={inChecklist}
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
        >
          <ChecklistIcon />
        </button>
      </div>
      <EditorContent editor={editor} className="notes__editor" />
    </div>
  );
}
