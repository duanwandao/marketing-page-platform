import { useState } from "react";
import { PageRenderer } from "@mpp/renderer";
import { Canvas } from "./Canvas/Canvas";
import { ComponentLibrary } from "./ComponentLibrary";
import { EditorToolbar } from "./EditorToolbar";
import { PropertyPanel } from "./PropertyPanel/PropertyPanel";
import { useEditorStore } from "./store/editor-store";

export function EditorPage() {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const pageSchema = useEditorStore((state) => state.pageSchema);

  return (
    <div className="editor-shell">
      <EditorToolbar mode={mode} onModeChange={setMode} title={pageSchema.title} />
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
