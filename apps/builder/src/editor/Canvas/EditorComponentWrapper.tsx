import type { PropsWithChildren } from "react";
import { useEditorStore } from "../store/editor-store";

interface EditorComponentWrapperProps extends PropsWithChildren {
  componentId: string;
  isFirst: boolean;
  isLast: boolean;
}

export function EditorComponentWrapper({
  children,
  componentId,
  isFirst,
  isLast
}: EditorComponentWrapperProps) {
  const selectedComponentId = useEditorStore((state) => state.selectedComponentId);
  const selectComponent = useEditorStore((state) => state.selectComponent);
  const removeComponent = useEditorStore((state) => state.removeComponent);
  const moveComponentUp = useEditorStore((state) => state.moveComponentUp);
  const moveComponentDown = useEditorStore((state) => state.moveComponentDown);
  const isSelected = selectedComponentId === componentId;

  return (
    <section
      className={`editor-component${isSelected ? " editor-component--selected" : ""}`}
      onClick={() => selectComponent(componentId)}
    >
      <div className="editor-component__content">{children}</div>
      <div className="editor-component__tools" onClick={(event) => event.stopPropagation()}>
        <button disabled={isFirst} onClick={() => moveComponentUp(componentId)} title="Move up" type="button">
          ↑
        </button>
        <button
          disabled={isLast}
          onClick={() => moveComponentDown(componentId)}
          title="Move down"
          type="button"
        >
          ↓
        </button>
        <button onClick={() => removeComponent(componentId)} title="Delete" type="button">
          ×
        </button>
      </div>
    </section>
  );
}
