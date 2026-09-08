import { describe, expect, it } from "vitest";
import type { ComponentDefinition } from "@mpp/component-core";
import { ComponentRegistry } from "./component-registry";

const Demo = () => <div>Demo</div>;

const definition: ComponentDefinition = {
  type: "Demo",
  name: "Demo",
  component: Demo,
  defaultProps: {},
  configSchema: []
};

describe("ComponentRegistry", () => {
  it("registers and retrieves a component definition", () => {
    const registry = new ComponentRegistry();
    registry.register(definition);

    expect(registry.get("Demo")).toBe(definition);
    expect(registry.has("Demo")).toBe(true);
  });

  it("returns all registered component definitions", () => {
    const registry = new ComponentRegistry();
    registry.register(definition);

    expect(registry.getAll()).toEqual([definition]);
  });

  it("throws a clear error for duplicate component type registration", () => {
    const registry = new ComponentRegistry();
    registry.register(definition);

    expect(() => registry.register(definition)).toThrow("Component type already registered: Demo");
  });

  it("returns undefined for unknown component types", () => {
    const registry = new ComponentRegistry();

    expect(registry.get("Unknown")).toBeUndefined();
    expect(registry.has("Unknown")).toBe(false);
  });
});
