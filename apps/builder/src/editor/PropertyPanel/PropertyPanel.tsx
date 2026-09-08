import { componentRegistry } from "@mpp/component-registry";
import { FieldRenderer } from "./FieldRenderer";
import { useEditorStore } from "../store/editor-store";

export function PropertyPanel() {
  const selectedComponentId = useEditorStore((state) => state.selectedComponentId);
  const components = useEditorStore((state) => state.pageSchema.components);
  const updateComponentProps = useEditorStore((state) => state.updateComponentProps);
  const selectedComponent = components.find((component) => component.id === selectedComponentId);

  if (!selectedComponent) {
    return (
      <aside className="property-panel" aria-label="Property Panel">
        <h2>Properties</h2>
        <p className="property-panel__empty">请选择一个组件进行编辑</p>
      </aside>
    );
  }

  const definition = componentRegistry.get(selectedComponent.type);

  if (!definition) {
    return (
      <aside className="property-panel" aria-label="Property Panel">
        <h2>Properties</h2>
        <p className="property-panel__empty">Unknown component: {selectedComponent.type}</p>
      </aside>
    );
  }

  return (
    <aside className="property-panel" aria-label="Property Panel">
      <h2>{definition.name}</h2>
      <div className="property-panel__fields">
        {definition.configSchema.map((field) => (
          <FieldRenderer
            field={field}
            key={field.key}
            value={selectedComponent.props[field.key]}
            onChange={(value) => updateComponentProps(selectedComponent.id, { [field.key]: value })}
          />
        ))}
      </div>
    </aside>
  );
}
