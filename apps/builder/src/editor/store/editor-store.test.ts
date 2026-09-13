import { beforeEach, describe, expect, it } from "vitest";
import { componentRegistry } from "@mpp/component-registry";
import { useEditorStore } from "./editor-store";

describe("editor store", () => {
  beforeEach(() => {
    componentRegistry.clear();
    componentRegistry.register({
      type: "Demo",
      name: "Demo",
      component: () => null,
      defaultProps: { title: "Default", nested: { count: 1 } },
      configSchema: []
    });
    useEditorStore.getState().loadPage({
      schemaVersion: 1,
      id: "test-page",
      title: "Test",
      components: []
    });
  });

  it("adds a component from registry defaults and selects it", () => {
    useEditorStore.getState().addComponent("Demo");

    const { pageSchema, selectedComponentId } = useEditorStore.getState();
    expect(pageSchema!.components).toHaveLength(1);
    expect(pageSchema!.components[0].type).toBe("Demo");
    expect(pageSchema!.components[0].props).toEqual({ title: "Default", nested: { count: 1 } });
    expect(selectedComponentId).toBe(pageSchema!.components[0].id);
  });

  it("clones default props when adding components", () => {
    useEditorStore.getState().addComponent("Demo");
    useEditorStore.getState().addComponent("Demo");
    const [first, second] = useEditorStore.getState().pageSchema!.components;

    expect(first.props).toEqual(second.props);
    expect(first.props).not.toBe(second.props);
    expect(first.props.nested).not.toBe(second.props.nested);
  });

  it("selects, updates, removes, and reorders components", () => {
    useEditorStore.getState().addComponent("Demo");
    useEditorStore.getState().addComponent("Demo");
    const [first, second] = useEditorStore.getState().pageSchema!.components;

    useEditorStore.getState().selectComponent(first.id);
    expect(useEditorStore.getState().selectedComponentId).toBe(first.id);

    useEditorStore.getState().updateComponentProps(first.id, { title: "Updated" });
    expect(useEditorStore.getState().pageSchema!.components[0].props.title).toBe("Updated");

    useEditorStore.getState().moveComponentDown(first.id);
    expect(useEditorStore.getState().pageSchema!.components[1].id).toBe(first.id);

    useEditorStore.getState().moveComponentUp(first.id);
    expect(useEditorStore.getState().pageSchema!.components[0].id).toBe(first.id);

    useEditorStore.getState().removeComponent(first.id);
    expect(useEditorStore.getState().pageSchema!.components.map((component) => component.id)).toEqual([
      second.id
    ]);
    expect(useEditorStore.getState().selectedComponentId).toBeNull();
  });

  it("advances revision when the title or component schema changes", () => {
    expect(useEditorStore.getState().revision).toBe(0);

    useEditorStore.getState().updatePageTitle("Renamed");
    expect(useEditorStore.getState().revision).toBe(1);

    useEditorStore.getState().addComponent("Demo");
    expect(useEditorStore.getState().revision).toBe(2);

    const componentId = useEditorStore.getState().pageSchema?.components[0].id;
    expect(componentId).toBeDefined();
    useEditorStore.getState().updateComponentProps(componentId!, { title: "Changed" });
    expect(useEditorStore.getState().revision).toBe(3);
  });

  it("loads a page as a clean editor session", () => {
    useEditorStore.getState().updatePageTitle("Dirty");

    useEditorStore.getState().loadPage({
      schemaVersion: 1,
      id: "another-page",
      title: "Another",
      components: []
    });

    const state = useEditorStore.getState();
    expect(state.pageSchema?.id).toBe("another-page");
    expect(state.selectedComponentId).toBeNull();
    expect(state.revision).toBe(0);
    expect(state.lastSavedRevision).toBe(0);
  });

  it("does not mark a later edit as saved when an older revision completes", () => {
    useEditorStore.getState().updatePageTitle("Revision one");
    const capturedRevision = useEditorStore.getState().revision;
    useEditorStore.getState().updatePageTitle("Revision two");

    useEditorStore.getState().markSaved(capturedRevision);

    const state = useEditorStore.getState();
    expect(state.revision).toBe(2);
    expect(state.lastSavedRevision).toBe(1);
    expect(state.revision === state.lastSavedRevision).toBe(false);
  });
});
