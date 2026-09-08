import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { componentRegistry } from "@mpp/component-registry";
import { useEditorStore } from "../store/editor-store";
import { PropertyPanel } from "./PropertyPanel";

describe("PropertyPanel", () => {
  beforeEach(() => {
    componentRegistry.clear();
    componentRegistry.register({
      type: "Banner",
      name: "Banner",
      component: () => null,
      defaultProps: { title: "Original", image: "", backgroundColor: "#ffffff" },
      configSchema: [{ key: "title", label: "Title", type: "text" }]
    });
    useEditorStore.getState().resetPage({
      schemaVersion: 1,
      id: "demo",
      title: "Demo",
      components: [
        {
          id: "banner-1",
          type: "Banner",
          props: { title: "Original", image: "", backgroundColor: "#ffffff" }
        }
      ]
    });
    useEditorStore.getState().selectComponent("banner-1");
  });

  it("generates fields from config schema and updates selected component props", () => {
    render(<PropertyPanel />);

    const input = screen.getByLabelText("Title");
    expect(input).toHaveValue("Original");

    fireEvent.change(input, { target: { value: "Updated" } });
    expect(useEditorStore.getState().pageSchema.components[0].props.title).toBe("Updated");
  });
});
