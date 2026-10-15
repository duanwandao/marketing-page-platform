import { describe, expect, it } from "vitest";
import type { AgentRequest } from "@mpp/schema";
import { createAgentTools } from "./tools";

const request: AgentRequest = {
  instruction: "Create a product page",
  currentPage: { schemaVersion: 1, id: "page-1", title: "Original", components: [] },
  componentCatalog: [
    {
      type: "ProductList",
      name: "Product list",
      defaultProps: { title: "Products", products: [{ id: "sku-1", name: "Mooncake" }] },
      configSchema: [{ key: "title", label: "Title", type: "text" }]
    },
    {
      type: "Coupon",
      name: "Coupon",
      defaultProps: { title: "Coupon", amount: 20 },
      configSchema: [
        { key: "title", label: "Title", type: "text" },
        { key: "amount", label: "Amount", type: "number" }
      ]
    }
  ]
};

describe("agent tools", () => {
  it("preserves ProductList default products while applying its title override", () => {
    const result = createAgentTools(request).execute("submit_page_layout", {
      components: [{ type: "ProductList", props: { title: "Recommended" } }]
    });

    expect(result.success).toBe(true);
    expect(result.proposedSchema?.components[0]).toEqual({
      id: "productlist-1",
      type: "ProductList",
      props: { title: "Recommended", products: [{ id: "sku-1", name: "Mooncake" }] }
    });
  });

  it("returns validation errors for unknown props and incorrect config value types", () => {
    const tools = createAgentTools(request);
    expect(
      tools.execute("submit_page_layout", { components: [{ type: "Coupon", props: { unknown: true } }] })
    ).toMatchObject({ success: false, observation: { errors: [expect.stringContaining("unknown")] } });
    expect(
      tools.execute("submit_page_layout", { components: [{ type: "Coupon", props: { amount: "30" } }] })
    ).toMatchObject({ success: false, observation: { errors: [expect.stringContaining("number")] } });
  });

  it("lists component names and rejects unknown definitions", () => {
    const tools = createAgentTools(request);
    expect(tools.execute("list_components", {}).observation).toEqual([
      { type: "ProductList", name: "Product list" },
      { type: "Coupon", name: "Coupon" }
    ]);
    expect(tools.execute("get_component_definition", { type: "Missing" })).toMatchObject({
      success: false,
      observation: { errors: [expect.stringContaining("Unknown component")] }
    });
  });

  it("redacts credential-like values from trace arguments", () => {
    const result = createAgentTools(request).execute("list_components", { apiKey: "secret-value", nested: { authorization: "Bearer secret" } });
    expect(result.trace.arguments).toEqual({ apiKey: "[REDACTED]", nested: { authorization: "[REDACTED]" } });
  });
});

describe("editing tools working draft", () => {
  it("accumulates successful batches and rolls back a later failing batch", () => {
    const input = structuredClone(request);
    input.currentPage.components = [{ id: "coupon-existing", type: "Coupon", props: { title: "Special", amount: 20 } }];
    const tools = createAgentTools(input);
    const result = tools.execute("apply_page_changes", { changes: [{ operation: "update_component", componentId: "coupon-existing", props: { amount: 50 } }] });
    expect(result).toMatchObject({ success: true, proposedSchema: { components: [{ id: "coupon-existing", props: { amount: 50, title: "Special" } }] } });
    expect(result.observation).toEqual({ success: true, page: result.proposedSchema });
    const accepted = structuredClone(result.proposedSchema);
    const failed = tools.execute("apply_page_changes", { changes: [
      { operation: "update_component", componentId: "coupon-existing", props: { amount: 80 } },
      { operation: "remove_component", componentId: "missing" }
    ] });
    expect(failed).toMatchObject({ success: false, observation: { errors: [expect.stringContaining("changes[1]")] } });
    expect(tools.execute("get_current_page", {}).observation).toEqual(accepted);
    expect(input.currentPage.components[0].props.amount).toBe(20);
  });
  it("isolates all page observations and proposals from the working draft", () => {
    const tools = createAgentTools(request);
    const result = tools.execute("apply_page_changes", { changes: [{ operation: "add_component", component: { type: "Coupon" } }] });
    expect(result.success).toBe(true);
    const accepted = structuredClone(result.proposedSchema);
    result.proposedSchema!.components[0].props.amount = 999;
    (result.observation as { page: NonNullable<typeof result.proposedSchema> }).page.components.length = 0;
    const read = tools.execute("get_current_page", {}).observation as NonNullable<typeof result.proposedSchema>;
    expect(read).toEqual(accepted);
    read.components.length = 0;
    expect(tools.execute("get_current_page", {}).observation).toEqual(accepted);
    expect(request.currentPage.components).toEqual([]);
  });
  it("uses accepted replacements as the base for later edits and replacement titles", () => {
    const tools = createAgentTools(request);
    const replacement = tools.execute("submit_page_layout", { title: "New title", components: [{ type: "Coupon" }] });
    expect(replacement.success).toBe(true);
    expect(replacement.observation).toMatchObject({ success: true, page: replacement.proposedSchema });
    expect(tools.execute("get_current_page", {}).observation).toEqual(replacement.proposedSchema);
    expect(tools.execute("apply_page_changes", { changes: [{ operation: "update_component", componentId: "coupon-1", props: { amount: 50 } }] })).toMatchObject({ success: true });
    expect(tools.execute("submit_page_layout", { title: "Rejected", components: [{ type: "Missing" }] }).success).toBe(false);
    expect(tools.execute("get_current_page", {}).observation).toMatchObject({ title: "New title", components: [{ props: { amount: 50 } }] });
    expect(tools.execute("submit_page_layout", { components: [] }).proposedSchema?.title).toBe("New title");
  });
  it("rejects malformed tool envelopes and keeps trace sanitation", () => {
    const tools = createAgentTools(request);
    for (const args of [null, {}, { changes: [], extra: true }]) {
      expect(tools.execute("apply_page_changes", args)).toMatchObject({ success: false });
    }
    const result = tools.execute("apply_page_changes", { changes: [{ operation: "add_component", component: { type: "Coupon", props: { secretToken: "hidden" } } }] });
    expect(JSON.stringify(result.trace.arguments)).not.toContain("hidden");
  });
});

it("rejects explicit null layout props instead of silently replacing them with defaults", () => {
  const result = createAgentTools(request).execute("submit_page_layout", { components: [{ type: "Coupon", props: null }] });
  expect(result).toMatchObject({ success: false, observation: { errors: [expect.stringContaining("object")] } });
});
