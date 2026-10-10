import { useEffect, useState } from "react";
import { useEditorStore } from "./store/editor-store";
import { CopilotPanel } from "./copilot/CopilotPanel";
import { PropertyPanel } from "./PropertyPanel/PropertyPanel";

type SidebarPanel = "properties" | "copilot";

export function EditorSidebar() {
  const [activePanel, setActivePanel] = useState<SidebarPanel>("properties");
  const selectedComponentId = useEditorStore((state) => state.selectedComponentId);

  useEffect(() => {
    if (selectedComponentId) setActivePanel("properties");
  }, [selectedComponentId]);

  return (
    <aside className="editor-sidebar" aria-label="Editor tools">
      <div className="editor-sidebar__tabs" role="tablist" aria-label="Editor tools">
        <button id="editor-properties-tab" role="tab" aria-controls="editor-properties-panel" aria-selected={activePanel === "properties"} onClick={() => setActivePanel("properties")} type="button">Properties</button>
        <button id="editor-copilot-tab" role="tab" aria-controls="editor-copilot-panel" aria-selected={activePanel === "copilot"} onClick={() => setActivePanel("copilot")} type="button">AI Copilot</button>
      </div>
      <div id="editor-properties-panel" className="editor-sidebar__panel" role="tabpanel" aria-labelledby="editor-properties-tab" hidden={activePanel !== "properties"}>
        <PropertyPanel />
      </div>
      <div id="editor-copilot-panel" className="editor-sidebar__panel" role="tabpanel" aria-labelledby="editor-copilot-tab" hidden={activePanel !== "copilot"}>
        <CopilotPanel />
      </div>
    </aside>
  );
}
