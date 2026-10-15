import { describe, expect, it } from "vitest";
import type { AgentComponentDefinition, PageSchema } from "@mpp/schema";
import { validateComponent, validatePageSchema, validateProps } from "./validator";

const catalog: AgentComponentDefinition[] = [
  { type: "Coupon", name: "Coupon", defaultProps: { title: "Coupon", amount: 20, threshold: 50 }, configSchema: [
    { key: "title", label: "Title", type: "text" }, { key: "amount", label: "Amount", type: "number" },
    { key: "threshold", label: "Threshold", type: "number" }, { key: "enabled", label: "Enabled", type: "switch" }
  ] },
  { type: "ProductList", name: "Products", defaultProps: { title: "Products", products: [{ id: "sku-1" }] }, configSchema: [{ key: "title", label: "Title", type: "text" }] }
];
const page: PageSchema = { schemaVersion: 1, id: "page-1", title: "Draft", components: [
  { id: "coupon-1", type: "Coupon", props: { title: "Special", amount: 20, threshold: 50 } },
  { id: "products-1", type: "ProductList", props: { title: "Featured", products: [{ id: "sku-1" }] } }
] };

describe("page validation", () => {
  it("accepts configurable patches without merging defaults", () => {
    const patch = { amount: 50, enabled: false };
    expect(validateProps("Coupon", patch, catalog)).toEqual([]);
    expect(patch).toEqual({ amount: 50, enabled: false });
  });
  it.each(["50", NaN, Infinity, null, true])("rejects invalid number %s", (amount) => {
    expect(validateProps("Coupon", { amount }, catalog)).toContain("Coupon.amount must be a number");
  });
  it("rejects unknown types, props, and incorrect primitive types", () => {
    expect(validateProps("Missing", {}, catalog).join()).toContain("Unknown component type");
    expect(validateProps("Coupon", { unknown: 1 }, catalog).join()).toContain("not configurable");
    expect(validateProps("Coupon", { title: 5, enabled: "yes", threshold: "50" }, catalog)).toHaveLength(3);
    expect(validateProps("Coupon", [], catalog).join()).toContain("object");
  });
  it("preserves default-only data in pages but rejects it in patches", () => {
    const before = structuredClone(page);
    expect(validatePageSchema(page, catalog)).toEqual([]);
    expect(validateComponent(page.components[1], catalog)).toEqual([]);
    expect(validateProps("ProductList", { products: [] }, catalog).join()).toContain("not configurable");
    expect(page).toEqual(before);
  });
  it.each([
    null, {}, { ...page, schemaVersion: 2 }, { ...page, id: " " }, { ...page, title: 1 },
    { ...page, components: {} }, { ...page, components: [page.components[0], page.components[0]] },
    { ...page, components: [{ ...page.components[0], id: "" }] },
    { ...page, components: [{ ...page.components[0], type: "Missing" }] },
    { ...page, components: [{ ...page.components[0], props: { title: "Coupon", amount: 20 } }] },
    { ...page, components: [{ ...page.components[0], props: { ...page.components[0].props, alien: 1 } }] },
    { ...page, components: [{ ...page.components[0], props: { ...page.components[0].props, amount: "50" } }] }
  ])("rejects malformed or invalid page %#", (candidate) => {
    expect(validatePageSchema(candidate, catalog).length).toBeGreaterThan(0);
  });
});
