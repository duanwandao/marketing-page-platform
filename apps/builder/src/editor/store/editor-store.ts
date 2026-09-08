import { create } from "zustand";
import { componentRegistry } from "@mpp/component-registry";
import type { PageSchema } from "@mpp/schema";
import { demoPageSchema } from "../demo-page-schema";

interface EditorState {
  pageSchema: PageSchema;
  selectedComponentId: string | null;
  addComponent: (type: string) => void;
  removeComponent: (id: string) => void;
  selectComponent: (id: string | null) => void;
  updateComponentProps: (id: string, patch: Record<string, unknown>) => void;
  moveComponentUp: (id: string) => void;
  moveComponentDown: (id: string) => void;
  resetPage: (schema: PageSchema) => void;
}

function createComponentId(type: string) {
  return `${type.toLowerCase()}-${crypto.randomUUID()}`;
}

function moveComponent(schema: PageSchema, id: string, direction: -1 | 1): PageSchema {
  const index = schema.components.findIndex((component) => component.id === id);
  const nextIndex = index + direction;

  if (index < 0 || nextIndex < 0 || nextIndex >= schema.components.length) {
    return schema;
  }

  const components = [...schema.components];
  const [component] = components.splice(index, 1);
  components.splice(nextIndex, 0, component);

  return { ...schema, components };
}

export const useEditorStore = create<EditorState>((set) => ({
  pageSchema: structuredClone(demoPageSchema),
  selectedComponentId: null,
  addComponent: (type) => {
    const definition = componentRegistry.get(type);
    if (!definition) {
      return;
    }

    const id = createComponentId(type);
    set((state) => ({
      pageSchema: {
        ...state.pageSchema,
        components: [
          ...state.pageSchema.components,
          {
            id,
            type,
            props: structuredClone(definition.defaultProps)
          }
        ]
      },
      selectedComponentId: id
    }));
  },
  removeComponent: (id) =>
    set((state) => ({
      pageSchema: {
        ...state.pageSchema,
        components: state.pageSchema.components.filter((component) => component.id !== id)
      },
      selectedComponentId: state.selectedComponentId === id ? null : state.selectedComponentId
    })),
  selectComponent: (id) => set({ selectedComponentId: id }),
  updateComponentProps: (id, patch) =>
    set((state) => ({
      pageSchema: {
        ...state.pageSchema,
        components: state.pageSchema.components.map((component) =>
          component.id === id ? { ...component, props: { ...component.props, ...patch } } : component
        )
      }
    })),
  moveComponentUp: (id) => set((state) => ({ pageSchema: moveComponent(state.pageSchema, id, -1) })),
  moveComponentDown: (id) => set((state) => ({ pageSchema: moveComponent(state.pageSchema, id, 1) })),
  resetPage: (schema) => set({ pageSchema: structuredClone(schema), selectedComponentId: null })
}));
