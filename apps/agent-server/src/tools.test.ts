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
});
