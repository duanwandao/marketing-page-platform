import { Link } from "react-router-dom";
import type { PageStatus } from "../pages/page-record";

interface EditorToolbarProps {
  title: string;
  mode: "edit" | "preview";
  status: PageStatus;
  saveLabel: string;
  busy: boolean;
  hasUnsavedChanges: boolean;
  onModeChange: (mode: "edit" | "preview") => void;
  onTitleChange: (title: string) => void;
  onSave: () => void;
  onPublish: () => void;
  pageId: string;
}

export function EditorToolbar({
  title,
  mode,
  status,
  saveLabel,
  busy,
  hasUnsavedChanges,
  onModeChange,
  onTitleChange,
  onSave,
  onPublish,
  pageId
}: EditorToolbarProps) {
  return (
    <header className="editor-toolbar">
      <Link className="toolbar-link" to="/">Back to pages</Link>
      <input aria-label="Page title" onChange={(event) => onTitleChange(event.target.value)} value={title} />
      <span className={`status-badge status-badge--${status}`}>{status}</span>
      <span className="save-status" role="status">{saveLabel}</span>
      <div className="editor-toolbar__actions">
        <div className="segmented-control" aria-label="Editor mode">
          <button aria-pressed={mode === "edit"} onClick={() => onModeChange("edit")} type="button">
            Edit
          </button>
          <button aria-pressed={mode === "preview"} onClick={() => onModeChange("preview")} type="button">
            Preview
          </button>
        </div>
        <button disabled={busy || !hasUnsavedChanges} onClick={onSave} type="button">Save</button>
        <button disabled={busy} onClick={onPublish} type="button">Publish</button>
        {status === "published" ? <Link to={`/pages/${pageId}`}>View published page</Link> : null}
      </div>
    </header>
  );
}
