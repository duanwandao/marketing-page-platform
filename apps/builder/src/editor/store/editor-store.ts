import { create } from "zustand";
import { componentRegistry } from "@mpp/component-registry";
import type { PageSchema } from "@mpp/schema";

interface EditorState {
  pageSchema: PageSchema | null;
  selectedComponentId: string | null;
  revision: number;
  lastSavedRevision: number;
  addComponent: (type: string) => void;
  removeComponent: (id: string) => void;
  selectComponent: (id: string | null) => void;
  updatePageTitle: (title: string) => void;
  updateComponentProps: (id: string, patch: Record<string, unknown>) => void;
  moveComponentUp: (id: string) => void;
  moveComponentDown: (id: string) => void;
  loadPage: (schema: PageSchema) => void;
  replacePageSchema: (schema: PageSchema) => void;
  clearPage: () => void;
  markSaved: (revision: number) => void;
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
  pageSchema: null,
  selectedComponentId: null,
  revision: 0,
  lastSavedRevision: 0,
  addComponent: (type) => {
    const definition = componentRegistry.get(type);
    if (!definition) {
      return;
    }

    const id = createComponentId(type);
    set((state) => {
      if (!state.pageSchema) {
        return state;
      }

      return {
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
        selectedComponentId: id,
        revision: state.revision + 1
      };
    });
  },
  removeComponent: (id) =>
    set((state) => {
      if (!state.pageSchema || !state.pageSchema.components.some((component) => component.id === id)) {
        return state;
      }

      return {
        pageSchema: {
          ...state.pageSchema,
          components: state.pageSchema.components.filter((component) => component.id !== id)
        },
        selectedComponentId: state.selectedComponentId === id ? null : state.selectedComponentId,
        revision: state.revision + 1
      };
    }),
  selectComponent: (id) => set({ selectedComponentId: id }),
  updatePageTitle: (title) =>
    set((state) => {
      if (!state.pageSchema || state.pageSchema.title === title) {
        return state;
      }

      return {
        pageSchema: { ...state.pageSchema, title },
        revision: state.revision + 1
      };
    }),
  updateComponentProps: (id, patch) =>
    set((state) => {
      if (!state.pageSchema || !state.pageSchema.components.some((component) => component.id === id)) {
        return state;
      }

      return {
        pageSchema: {
          ...state.pageSchema,
          components: state.pageSchema.components.map((component) =>
            component.id === id ? { ...component, props: { ...component.props, ...patch } } : component
          )
        },
        revision: state.revision + 1
      };
    }),
  moveComponentUp: (id) =>
    set((state) => {
      if (!state.pageSchema) {
        return state;
      }
      const pageSchema = moveComponent(state.pageSchema, id, -1);
      return pageSchema === state.pageSchema ? state : { pageSchema, revision: state.revision + 1 };
    }),
  moveComponentDown: (id) =>
    set((state) => {
      if (!state.pageSchema) {
        return state;
      }
      const pageSchema = moveComponent(state.pageSchema, id, 1);
      return pageSchema === state.pageSchema ? state : { pageSchema, revision: state.revision + 1 };
    }),
  loadPage: (schema) =>
    set({
      pageSchema: structuredClone(schema),
      selectedComponentId: null,
      revision: 0,
      lastSavedRevision: 0
    }),
  replacePageSchema: (schema) =>
    set((state) => ({
      pageSchema: structuredClone(schema),
      selectedComponentId: null,
      revision: state.revision + 1
    })),
  clearPage: () =>
    set({ pageSchema: null, selectedComponentId: null, revision: 0, lastSavedRevision: 0 }),
  markSaved: (revision) =>
    set((state) => ({ lastSavedRevision: Math.max(state.lastSavedRevision, revision) }))
}));
