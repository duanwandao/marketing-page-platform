import { useEffect, useState } from "react";
import { ComponentRenderer } from "@mpp/renderer";
import { EditorComponentWrapper } from "./EditorComponentWrapper";
import { useEditorStore } from "../store/editor-store";
import { useCopilotSessionStore } from "../copilot/copilot-session-store";
import { Minus, Plus, ScanLine } from "lucide-react";

export function Canvas() {
  const components = useEditorStore((state) => state.pageSchema?.components ?? []);
  const pageId = useEditorStore((state) => state.pageSchema?.id);
  const acceptedPage = useEditorStore((state) => state.pageSchema);
  const session = useCopilotSessionStore((state) => pageId ? state.sessions[pageId] : undefined);
  const [showProposal, setShowProposal] = useState(false);
  const [zoom, setZoom] = useState(100);
  useEffect(() => { setShowProposal(false); }, [pageId]);
  const visiblePage = showProposal ? session?.pending?.proposedSchema : acceptedPage;
  const visibleComponents = visiblePage?.components ?? components;

  return (
    <div className="canvas" aria-label="Canvas">
      <div className="canvas__controls"><div>{session?.pending ? <button aria-pressed={showProposal} onClick={() => setShowProposal((value) => !value)} type="button">{showProposal ? "Current draft" : "Preview proposal"}</button> : <span>Current draft</span>}{showProposal ? <strong>Previewing AI proposal · Not applied</strong> : null}</div><div><button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(55, value - 10))} type="button"><Minus aria-hidden="true" size={13} /></button><span>{zoom}%</span><button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(140, value + 10))} type="button"><Plus aria-hidden="true" size={13} /></button><button aria-label="Fit canvas" onClick={() => setZoom(100)} type="button"><ScanLine aria-hidden="true" size={13} /> Fit</button></div></div>
      <div className={`canvas__page-wrap${showProposal ? " canvas__page-wrap--proposal" : ""}`}>
      <div className="canvas__page" style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}>
        {visibleComponents.length === 0 ? (
          <div className="canvas__empty">从左侧添加一个组件开始</div>
        ) : (
          visibleComponents.map((component, index) => (
            <EditorComponentWrapper
              componentId={component.id}
              isFirst={index === 0}
              isLast={index === visibleComponents.length - 1}
              readOnly={showProposal}
              highlighted={showProposal && session?.pending?.baseDraftSnapshot.components.some((old) => old.id !== component.id) === false}
              key={component.id}
            >
              <ComponentRenderer component={component} />
            </EditorComponentWrapper>
          ))
        )}
      </div>
      </div>
    </div>
  );
}
