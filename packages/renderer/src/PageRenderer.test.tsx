import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { componentRegistry } from "@mpp/component-registry";
import { PageRenderer } from "./PageRenderer";

describe("PageRenderer", () => {
  it("renders registered components in schema order", () => {
    componentRegistry.clear();
    componentRegistry.register({
      type: "First",
      name: "First",
      component: ({ label }) => <section>{String(label)}</section>,
      defaultProps: { label: "first" },
      configSchema: []
    });
    componentRegistry.register({
      type: "Second",
      name: "Second",
      component: ({ label }) => <section>{String(label)}</section>,
      defaultProps: { label: "second" },
      configSchema: []
    });

    render(
      <PageRenderer
        schema={{
          schemaVersion: 1,
          id: "demo",
          title: "Demo",
          components: [
            { id: "one", type: "First", props: { label: "A" } },
            { id: "two", type: "Second", props: { label: "B" } }
          ]
        }}
      />
    );

    expect(screen.getByText("A").compareDocumentPosition(screen.getByText("B"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("renders an unknown component fallback", () => {
    componentRegistry.clear();

    render(
      <PageRenderer
        schema={{
          schemaVersion: 1,
          id: "demo",
          title: "Demo",
          components: [{ id: "missing", type: "Missing", props: {} }]
        }}
      />
    );

    expect(screen.getByText("Unknown component: Missing")).toBeTruthy();
  });
});
