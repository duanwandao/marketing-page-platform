import { componentRegistry } from "@mpp/component-registry";
import { useEditorStore } from "./store/editor-store";

export function ComponentLibrary() {
  const addComponent = useEditorStore((state) => state.addComponent);
  const definitions = componentRegistry.getAll();

  return (
    <aside className="component-library" aria-label="Component Library">
      <h2>Components</h2>
      <div className="component-library__list">
        {definitions.map((definition) => (
          <button key={definition.type} onClick={() => addComponent(definition.type)} type="button">
            {definition.name}
          </button>
        ))}
      </div>
    </aside>
  );
}
