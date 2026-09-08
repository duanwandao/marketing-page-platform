import { ComponentRenderer } from "@mpp/renderer";
import { EditorComponentWrapper } from "./EditorComponentWrapper";
import { useEditorStore } from "../store/editor-store";

export function Canvas() {
  const components = useEditorStore((state) => state.pageSchema.components);

  return (
    <main className="canvas" aria-label="Canvas">
      <div className="canvas__page">
        {components.length === 0 ? (
          <div className="canvas__empty">从左侧添加一个组件开始</div>
        ) : (
          components.map((component, index) => (
            <EditorComponentWrapper
              componentId={component.id}
              isFirst={index === 0}
              isLast={index === components.length - 1}
              key={component.id}
            >
              <ComponentRenderer component={component} />
            </EditorComponentWrapper>
          ))
        )}
      </div>
    </main>
  );
}
