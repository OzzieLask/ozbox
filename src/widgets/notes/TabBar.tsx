import { useEffect, useState } from "react";
import { addTab, hasContent, MAX_TABS, type NoteTab, removeTab, selectTab, updateTab } from "./model";

type TabBarProps = {
  tabs: NoteTab[];
  activeId: string;
};

/** Note tabs: click to switch, double-click to rename, × to delete, + to add. */
export function TabBar({ tabs, activeId }: TabBarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Deleting a tab with content takes a second click on "Delete?".
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmingId) return;
    const timer = setTimeout(() => setConfirmingId(null), 2500);
    return () => clearTimeout(timer);
  }, [confirmingId]);

  const onDelete = (tab: NoteTab) => {
    if (hasContent(tab.doc) && confirmingId !== tab.id) setConfirmingId(tab.id);
    else {
      setConfirmingId(null);
      removeTab(tab.id);
    }
  };

  return (
    <div className="note-tabs" role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        if (tab.id === renamingId) {
          return (
            <RenameInput
              key={tab.id}
              title={tab.title}
              onDone={(title) => {
                if (title !== null) updateTab(tab.id, { title });
                setRenamingId(null);
              }}
            />
          );
        }
        return (
          <div key={tab.id} className={`note-tab${active ? " note-tab--active" : ""}`}>
            <button
              className="note-tab__title"
              role="tab"
              aria-selected={active}
              title="Double-click to rename"
              onClick={() => selectTab(tab.id)}
              onDoubleClick={() => setRenamingId(tab.id)}
            >
              {tab.title}
            </button>
            {active && tabs.length > 1 && (
              <button
                className={`note-tab__close${confirmingId === tab.id ? " is-confirming" : ""}`}
                aria-label={`Delete ${tab.title}`}
                onClick={() => onDelete(tab)}
              >
                {confirmingId === tab.id ? "Delete?" : "×"}
              </button>
            )}
          </div>
        );
      })}
      {tabs.length < MAX_TABS && (
        <button className="note-tabs__add" aria-label="New tab" title="New tab" onClick={addTab}>
          +
        </button>
      )}
    </div>
  );
}

type RenameInputProps = {
  title: string;
  /** New title, or null if cancelled. */
  onDone: (title: string | null) => void;
};

function RenameInput({ title, onDone }: RenameInputProps) {
  const [value, setValue] = useState(title);
  const commit = () => onDone(value.trim() || title);

  return (
    <input
      className="note-tab__rename"
      value={value}
      maxLength={24}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          // Cancel the rename without also closing the panel.
          e.stopPropagation();
          onDone(null);
        }
      }}
    />
  );
}
