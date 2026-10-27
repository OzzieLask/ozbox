import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { FolderIcon } from "../../ui/icons";
import {
  addShortcut,
  closePin,
  FILES_DROPPED_EVENT,
  hostOf,
  linkFromDrop,
  openPin,
  pinFile,
  removeShortcut,
  renameShortcut,
  sendDroppedFiles,
  type Shortcut,
  shortcutsStore,
  toUrl,
  usePins,
  VIEWABLE_EXTENSIONS,
} from "./pins";

export function PinPanel() {
  const pins = usePins();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  // dragenter/dragleave fire for every child element; count to know when the drag really left.
  const dragDepth = useRef(0);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(String(err));
    }
  };

  const pinText = () => run(async () => {
    await openPin(toUrl(text));
    setText("");
  });

  const pinPaths = (paths: string[]) => paths.forEach((path) => run(() => pinFile(path)));

  // Paths of files dropped on the panel arrive from the native side (drop.rs).
  useEffect(() => {
    const unlisten = listen<string[]>(FILES_DROPPED_EVENT, ({ payload }) => pinPaths(payload));
    return () => {
      unlisten.then((off) => off());
    };
  }, []);

  const chooseFiles = () =>
    run(async () => {
      const picked = await openFileDialog({
        multiple: true,
        filters: [{ name: "Pages OzBox can show", extensions: VIEWABLE_EXTENSIONS }],
      });
      if (picked) pinPaths(Array.isArray(picked) ? picked : [picked]);
    });

  return (
    <div
      className={`pin${dropping ? " is-dropping" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDropping(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setDropping(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDropping(false);
        if (sendDroppedFiles(e.dataTransfer.files)) return;
        const link = linkFromDrop(e.dataTransfer);
        if (link) run(() => openPin(link));
        else setError("That doesn't look like a link or a file.");
      }}
    >
      <form
        className="pin__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) pinText();
        }}
      >
        <input
          className="pin__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste a link, search, or drop here…"
          spellCheck={false}
          autoFocus
        />
        <button
          type="button"
          className="pin__icon-button"
          title="Open a file (PDF, image, video, text…)"
          aria-label="Open file"
          onClick={chooseFiles}
        >
          <FolderIcon />
        </button>
        <button className="pin__go" type="submit" disabled={!text.trim()}>
          Pin
        </button>
      </form>

      <ShortcutRow
        onOpen={(url) => run(() => openPin(url))}
        onAdd={() => {
          if (!text.trim()) return setError("Type a link above, then + saves it as a tab.");
          addShortcut(toUrl(text));
          setText("");
          setError(null);
        }}
      />

      {error && <p className="pin__error">{error}</p>}

      <div className="pin__list">
        {dropping ? (
          <p className="pin__drop-hint">Drop to pin it</p>
        ) : pins.length === 0 ? (
          <p className="pin__empty">Pinned pages and files float above everything else.</p>
        ) : (
          pins.map((p) => (
            <div key={p.id} className="pin__row">
              <span className="pin__row-title" title={p.url}>
                {p.title}
                {p.url.startsWith("http") && <span className="pin__row-host"> · {hostOf(p.url)}</span>}
              </span>
              <button className="pin__row-close" aria-label={`Close ${p.title}`} onClick={() => closePin(p.id)}>
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type ShortcutRowProps = {
  onOpen: (url: string) => void;
  onAdd: () => void;
};

/** Saved sites: click to pin, double-click to rename, × to remove, + to add. */
function ShortcutRow({ onOpen, onAdd }: ShortcutRowProps) {
  const [{ shortcuts }] = shortcutsStore.use();
  const [renamingId, setRenamingId] = useState<string | null>(null);

  return (
    <div className="pin__shortcuts">
      {shortcuts.map((s) =>
        s.id === renamingId ? (
          <RenameChip
            key={s.id}
            shortcut={s}
            onDone={(label) => {
              if (label) renameShortcut(s.id, label);
              setRenamingId(null);
            }}
          />
        ) : (
          <div key={s.id} className="pin__chip" title={`${s.url}\nDouble-click to rename`}>
            <button
              className="pin__chip-open"
              onClick={() => onOpen(s.url)}
              onDoubleClick={() => setRenamingId(s.id)}
            >
              {s.label}
            </button>
            <button className="pin__chip-remove" aria-label={`Remove ${s.label}`} onClick={() => removeShortcut(s.id)}>
              ×
            </button>
          </div>
        ),
      )}
      <button className="pin__chip pin__chip--add" title="Save the link above as a tab" aria-label="Add tab" onClick={onAdd}>
        +
      </button>
    </div>
  );
}

function RenameChip({ shortcut, onDone }: { shortcut: Shortcut; onDone: (label: string | null) => void }) {
  const [value, setValue] = useState(shortcut.label);
  return (
    <input
      className="pin__chip-rename"
      value={value}
      maxLength={16}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(value.trim() || null);
        if (e.key === "Escape") {
          e.stopPropagation();
          onDone(null);
        }
      }}
    />
  );
}
