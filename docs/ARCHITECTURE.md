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

Page lifecycle data is represented by `PageRecord`. Its `schema` is the current editable draft, while `publishedSchema` is a deep-cloned snapshot created only by Publish.

```text
Draft PageSchema
    ↓ Save
PageRepository
    ↓
PageRecord.schema
```

```text
Draft PageSchema
    ↓ Publish
PageRepository
    ↓
PageRecord.publishedSchema
    ↓
Published Runtime
    ↓
PageRenderer
```

The published runtime never renders `PageRecord.schema`. A page is publicly renderable only when its status is `published` and `publishedSchema` is present.

## Packages

- `@mpp/schema` defines the shared page and component data contract.
- `@mpp/component-core` defines component integration contracts and property config fields.
- `@mpp/component-registry` stores component definitions by type.
- `@mpp/components` contains business components and their definitions.
- `@mpp/renderer` renders schema without knowing about builder state or editor UI.
- `builder` owns editor layout, canvas wrappers, property editing, and preview mode.
- `PageRepository` owns asynchronous page CRUD and persistence boundaries. `LocalStoragePageRepository` is the only module that accesses localStorage.
- Page-level React components own loading, repository errors, routing, Save, and Publish orchestration.
- `EditorStore` owns only the active draft schema, component selection/editing, and revision state used to detect unsaved changes safely.

## Guardrails

Renderer, Canvas, PropertyPanel, EditorStore, and ComponentLibrary do not branch on concrete business component types. Business-specific behavior belongs in `ComponentDefinition`, including defaults and config schema.

Business components do not import editor state or builder UI. Renderer does not import Zustand or builder modules.

Published pages import the shared renderer but no EditorStore, Canvas, PropertyPanel, or editing wrapper. Preview renders the current draft from EditorStore; published runtime renders the stored published snapshot.

## AI Page Copilot v1

```text
Builder → /api/agent → LLM ↔ Tool Loop → Validated proposal → Human Apply → EditorStore → PageSchema
```

`apps/agent-server` is stateless and owns the provider API key, OpenAI-compatible adapter, bounded tool loop, deterministic proposal validation, and sanitized execution trace. The Builder sends only serializable registry metadata (`type`, `name`, `defaultProps`, `configSchema`), never React implementations. The four model tools are `list_components`, `get_component_definition`, `get_current_page`, and `submit_page_layout`.

Apply calls `EditorStore.replacePageSchema`, making the editable draft dirty without repository I/O. Save and Publish remain user actions; published runtime continues to receive only `publishedSchema` through `PageRenderer`.
