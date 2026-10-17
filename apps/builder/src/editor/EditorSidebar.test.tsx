import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { componentRegistry } from "@mpp/component-registry";
import { useEditorStore } from "./store/editor-store";
import { EditorSidebar } from "./EditorSidebar";

afterEach(cleanup);

describe("EditorSidebar", () => {
  beforeEach(() => {
    componentRegistry.clear();
    componentRegistry.register({ type: "Demo", name: "Demo", component: () => null, defaultProps: { title: "Default" }, configSchema: [{ key: "title", label: "Title", type: "text" }] });
    useEditorStore.getState().loadPage({ schemaVersion: 1, id: "page-1", title: "Draft", components: [{ id: "demo-1", type: "Demo", props: { title: "Editable title" } }] });
  });

  it("defaults to Copilot and keeps Properties available as a workspace mode", () => {
    render(<EditorSidebar />);
    expect(screen.getByRole("tab", { name: "AI Copilot" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "AI Copilot" })).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Properties" }));
    expect(screen.getByRole("tabpanel", { name: "Properties" })).toBeVisible();
  });

  it("keeps Copilot open when a canvas component is selected", () => {
    render(<EditorSidebar />);
    fireEvent.click(screen.getByRole("tab", { name: "AI Copilot" }));
    act(() => useEditorStore.getState().selectComponent("demo-1"));
    expect(screen.getByRole("tab", { name: "AI Copilot" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Describe the page or change you want")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Properties" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Editable title");
  });
});
