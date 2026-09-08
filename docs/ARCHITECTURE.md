# Architecture

The platform centers on `PageSchema`. Builder actions mutate the schema through a Zustand editor store, and rendering reads the same schema through a shared renderer.

```text
Builder UI
    ↓
EditorStore
    ↓
PageSchema
```

```text
PageSchema
    ↓
ComponentRegistry
    ↓
ComponentDefinition
    ↓
React Component
```

## Packages

- `@mpp/schema` defines the shared page and component data contract.
- `@mpp/component-core` defines component integration contracts and property config fields.
- `@mpp/component-registry` stores component definitions by type.
- `@mpp/components` contains business components and their definitions.
- `@mpp/renderer` renders schema without knowing about builder state or editor UI.
- `builder` owns editor layout, canvas wrappers, property editing, and preview mode.

## Guardrails

Renderer, Canvas, PropertyPanel, EditorStore, and ComponentLibrary do not branch on concrete business component types. Business-specific behavior belongs in `ComponentDefinition`, including defaults and config schema.

Business components do not import editor state or builder UI. Renderer does not import Zustand or builder modules.
