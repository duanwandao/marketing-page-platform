interface EditorToolbarProps {
  title: string;
  mode: "edit" | "preview";
  onModeChange: (mode: "edit" | "preview") => void;
}

export function EditorToolbar({ title, mode, onModeChange }: EditorToolbarProps) {
  return (
    <header className="editor-toolbar">
      <h1>{title}</h1>
      <div className="segmented-control" aria-label="Editor mode">
        <button aria-pressed={mode === "edit"} onClick={() => onModeChange("edit")} type="button">
          Edit
        </button>
        <button aria-pressed={mode === "preview"} onClick={() => onModeChange("preview")} type="button">
          Preview
        </button>
      </div>
    </header>
  );
}
