import { Link } from "react-router-dom";
import { ArrowLeft, Bot } from "lucide-react";
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
  onToggleWorkspace: () => void;
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
  onToggleWorkspace,
  pageId
}: EditorToolbarProps) {
  return (
    <header className="editor-toolbar">
      <Link className="toolbar-link" to="/" aria-label="Back to pages" title="Back to pages"><ArrowLeft aria-hidden="true" size={17} /></Link>
      <div className="editor-toolbar__identity">
        <input aria-label="Page title" onChange={(event) => onTitleChange(event.target.value)} value={title} />
        <div className="editor-toolbar__meta"><span className={`status-badge status-badge--${status}`}>{status}</span><span className="save-status" role="status">{saveLabel}</span></div>
      </div>
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
        <button aria-label="Open assistant workspace" className="toolbar-workspace-toggle" onClick={onToggleWorkspace} type="button"><Bot aria-hidden="true" size={15} /> Assistant</button>
        {status === "published" ? <Link to={`/pages/${pageId}`}>View published page</Link> : null}
      </div>
    </header>
  );
}
