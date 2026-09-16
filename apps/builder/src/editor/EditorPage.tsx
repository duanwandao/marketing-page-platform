import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageRenderer } from "@mpp/renderer";
import type { PageRecord } from "../pages/page-record";
import type { PageRepository } from "../pages/repository/page-repository";
import { Canvas } from "./Canvas/Canvas";
import { ComponentLibrary } from "./ComponentLibrary";
import { EditorToolbar } from "./EditorToolbar";
import { PropertyPanel } from "./PropertyPanel/PropertyPanel";
import { useEditorStore } from "./store/editor-store";
import "./editor.css";

interface EditorPageProps {
  repository: PageRepository;
}

type Command = "idle" | "saving" | "publishing";

export function EditorPage({ repository }: EditorPageProps) {
  const { pageId } = useParams();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [page, setPage] = useState<PageRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [command, setCommand] = useState<Command>("idle");
  const [commandError, setCommandError] = useState<string | null>(null);
  const sessionRef = useRef(0);
  const pageSchema = useEditorStore((state) => state.pageSchema);
  const revision = useEditorStore((state) => state.revision);
  const lastSavedRevision = useEditorStore((state) => state.lastSavedRevision);
  const loadPage = useEditorStore((state) => state.loadPage);
  const clearPage = useEditorStore((state) => state.clearPage);
  const updatePageTitle = useEditorStore((state) => state.updatePageTitle);

  useEffect(() => {
    let active = true;
    const session = ++sessionRef.current;
    clearPage();
    setPage(null);
    setLoading(true);
    setLoadError(null);
    setCommand("idle");
    setCommandError(null);

    if (!pageId) {
      setLoading(false);
      return;
    }

    repository
      .get(pageId)
      .then((record) => {
        if (!active) return;
        setPage(record);
        if (record) loadPage(record.schema);
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(cause instanceof Error ? cause.message : "Unable to load this page.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (sessionRef.current === session) sessionRef.current += 1;
      clearPage();
    };
  }, [clearPage, loadPage, pageId, repository]);

  async function save() {
    if (!pageId || command !== "idle") return;
    const state = useEditorStore.getState();
    if (!state.pageSchema) return;
    const schema = structuredClone(state.pageSchema);
    const capturedRevision = state.revision;
    const session = sessionRef.current;
    setCommand("saving");
    setCommandError(null);
    try {
      const updated = await repository.update(pageId, { title: schema.title, schema });
      if (sessionRef.current !== session) return;
      setPage(updated);
      useEditorStore.getState().markSaved(capturedRevision);
    } catch (cause) {
      if (sessionRef.current !== session) return;
      setCommandError(cause instanceof Error ? cause.message : "Unable to save this page.");
    } finally {
      if (sessionRef.current === session) setCommand("idle");
    }
  }

  async function publish() {
    if (!pageId || command !== "idle") return;
    const state = useEditorStore.getState();
    if (!state.pageSchema) return;
    const schema = structuredClone(state.pageSchema);
    const capturedRevision = state.revision;
    const session = sessionRef.current;
    setCommand("publishing");
    setCommandError(null);
    try {
      const updated = await repository.update(pageId, {
        title: schema.title,
        schema,
        publishedSchema: structuredClone(schema),
        status: "published"
      });
      if (sessionRef.current !== session) return;
      setPage(updated);
      useEditorStore.getState().markSaved(capturedRevision);
    } catch (cause) {
      if (sessionRef.current !== session) return;
      setCommandError(cause instanceof Error ? cause.message : "Unable to publish this page.");
    } finally {
      if (sessionRef.current === session) setCommand("idle");
    }
  }

  if (loading) return <main className="runtime-message">Loading editor…</main>;
  if (loadError) return <main className="runtime-message runtime-message--error">{loadError}</main>;
  if (!page || !pageSchema || !pageId) {
    return <main className="runtime-message">Page not found. <Link to="/">Back to pages</Link></main>;
  }

  const dirty = revision !== lastSavedRevision;
  const saveLabel = command === "saving"
    ? "Saving…"
    : command === "publishing"
      ? "Publishing…"
      : commandError ?? (dirty ? "Unsaved changes" : "Saved");

  return (
    <div className="editor-shell">
      <EditorToolbar
        busy={command !== "idle"}
        hasUnsavedChanges={dirty}
        mode={mode}
        onModeChange={setMode}
        onPublish={() => void publish()}
        onSave={() => void save()}
        onTitleChange={updatePageTitle}
        pageId={pageId}
        saveLabel={saveLabel}
        status={page.status}
        title={pageSchema.title}
      />
      {mode === "edit" ? (
        <div className="editor-layout">
          <ComponentLibrary />
          <Canvas />
          <PropertyPanel />
        </div>
      ) : (
        <div className="preview-surface">
          <PageRenderer schema={pageSchema} />
        </div>
      )}
    </div>
  );
}
