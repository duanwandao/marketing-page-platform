import { useState } from "react";
import { useEditorStore } from "./store/editor-store";
import { CopilotPanel } from "./copilot/CopilotPanel";
import { PropertyPanel } from "./PropertyPanel/PropertyPanel";

type SidebarPanel = "properties" | "copilot";

export function EditorSidebar({ onClose }: { onClose?: () => void }) {
  const [activePanel, setActivePanel] = useState<SidebarPanel>("copilot");
  const selectedComponentId = useEditorStore((state) => state.selectedComponentId);
  const component = useEditorStore((state) => state.pageSchema?.components.find((item) => item.id === selectedComponentId));

  return (
    <aside className="editor-sidebar" aria-label="Editor workspace">
      <div className="editor-sidebar__mobile-heading"><strong>Workspace</strong><button aria-label="Close workspace" onClick={onClose} type="button">×</button></div>
      <div className="editor-sidebar__tabs" role="tablist" aria-label="Editor tools">
        <button id="editor-properties-tab" role="tab" aria-controls="editor-properties-panel" aria-selected={activePanel === "properties"} onClick={() => setActivePanel("properties")} type="button">Properties</button>
        <button id="editor-copilot-tab" role="tab" aria-controls="editor-copilot-panel" aria-selected={activePanel === "copilot"} onClick={() => setActivePanel("copilot")} type="button">AI Copilot</button>
      </div>
      <div id="editor-properties-panel" className="editor-sidebar__panel" role="tabpanel" aria-labelledby="editor-properties-tab" hidden={activePanel !== "properties"}>
        <PropertyPanel />
      </div>
      <div id="editor-copilot-panel" className="editor-sidebar__panel" role="tabpanel" aria-labelledby="editor-copilot-tab" hidden={activePanel !== "copilot"}>
        {component ? <button className="editor-sidebar__edit-selected" onClick={() => document.getElementById("copilot-instruction")?.focus()} type="button">Edit selected {component.type} with AI</button> : null}
        <CopilotPanel />
      </div>
    </aside>
  );
}
