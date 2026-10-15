import { describe, expect, it } from "vitest";
import type { AgentComponentDefinition, PageSchema } from "@mpp/schema";
import { applyPageChanges } from "./mutations";

const catalog: AgentComponentDefinition[] = [
  { type: "Coupon", name: "Coupon", defaultProps: { title: "Coupon", amount: 20, threshold: 50 }, configSchema: [
    { key: "title", label: "Title", type: "text" }, { key: "amount", label: "Amount", type: "number" }, { key: "threshold", label: "Threshold", type: "number" }
  ] },
  { type: "ProductList", name: "Products", defaultProps: { title: "Products", products: [{ id: "sku-1" }] }, configSchema: [{ key: "title", label: "Title", type: "text" }] }
];
const page: PageSchema = { schemaVersion: 1, id: "page-1", title: "Draft", components: [
  { id: "coupon-1", type: "Coupon", props: { title: "Special", amount: 20, threshold: 90 } },
  { id: "products-1", type: "ProductList", props: { title: "Featured", products: [{ id: "custom-sku" }] } }
] };
const update = { operation: "update_component", componentId: "coupon-1", props: { amount: 50 } };
const add = { operation: "add_component", component: { type: "Coupon", props: { amount: 60 } } };
const remove = { operation: "remove_component", componentId: "products-1" };

describe("page mutations", () => {
  it("patches only the target property and preserves metadata, order and source", () => {
    const source = structuredClone(page);
    const result = applyPageChanges(source, [update], catalog);
    expect(result).toEqual({ success: true, page: { ...page, components: [
      { id: "coupon-1", type: "Coupon", props: { title: "Special", amount: 50, threshold: 90 } }, page.components[1]
    ] } });
    expect(source).toEqual(page);
  });
  it.each([
    [undefined, ["coupon-1", "products-1", "new-id"]],
    ["coupon-1", ["new-id", "coupon-1", "products-1"]],
    ["products-1", ["coupon-1", "new-id", "products-1"]]
  ])("adds with defaults at the requested position %s", (anchor, ids) => {
    const change = anchor ? { ...add, beforeComponentId: anchor } : add;
    const result = applyPageChanges(page, [change], catalog, () => "new-id");
    expect(result.success).toBe(true);
    if (!result.success) throw Error(result.errors.join());
    expect(result.page.components.map((c) => c.id)).toEqual(ids);
    expect(result.page.components.find((c) => c.id === "new-id")?.props).toEqual({ title: "Coupon", amount: 60, threshold: 50 });
    expect(catalog[0].defaultProps.amount).toBe(20);
  });
  it("generates unique IDs for repeated additions", () => {
    const result = applyPageChanges(page, [add, add], catalog);
    expect(result.success).toBe(true);
    if (!result.success) throw Error(result.errors.join());
    const ids = result.page.components.map((c) => c.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids[2]).toMatch(/^coupon-/);
  });
  it("removes only the exact component and preserves custom products", () => {
    expect(applyPageChanges(page, [remove], catalog)).toEqual({ success: true, page: { ...page, components: [page.components[0]] } });
    const result = applyPageChanges(page, [{ operation: "update_component", componentId: "products-1", props: { title: "New" } }], catalog);
    expect(result).toMatchObject({ success: true, page: { components: [page.components[0], { ...page.components[1], props: { title: "New", products: [{ id: "custom-sku" }] } }] } });
  });
  it("rolls back a failing batch and accepts a later corrected retry", () => {
    const source = structuredClone(page);
    const result = applyPageChanges(source, [update, { ...remove, componentId: "missing" }], catalog);
    expect(result).toMatchObject({ success: false, errors: [expect.stringContaining("changes[1]")] });
    expect(source).toEqual(page);
    expect(applyPageChanges(source, [update, remove], catalog)).toMatchObject({ success: true, page: { components: [{ props: { amount: 50 } }] } });
  });
  it("executes sequential operations against the evolving candidate", () => {
    const result = applyPageChanges(page, [{ ...add, beforeComponentId: "products-1" }, remove,
      { operation: "update_component", componentId: "new-id", props: { amount: 70 } }], catalog, () => "new-id");
    expect(result).toMatchObject({ success: true, page: { components: [page.components[0], { id: "new-id", props: { amount: 70 } }] } });
  });
  it.each([
    null, {}, [], [null], [{ operation: "unknown" }], [{ ...update, extra: true }], [{ ...update, componentId: " " }],
    [{ ...update, props: {} }], [{ ...update, props: [] }], [{ ...update, props: { amount: "50" } }],
    [{ ...update, props: { amount: NaN } }], [{ ...update, props: { amount: Infinity } }],
    [{ ...update, props: { unknown: true } }], [{ ...update, componentId: "missing" }],
    [{ ...add, beforeComponentId: "missing" }], [{ ...add, beforeComponentId: "" }],
    [{ ...add, component: { ...add.component, id: "injected" } }],
    [{ ...add, component: { type: "Missing" } }], [{ ...add, component: { type: "Coupon", props: null } }],
    [{ ...remove, componentId: "missing" }], [remove, remove],
    [{ ...update, componentId: "products-1", props: { products: [] } }]
  ])("rejects malformed or invalid batch %#", (changes) => {
    const source = structuredClone(page);
    expect(applyPageChanges(source, changes, catalog).success).toBe(false);
    expect(source).toEqual(page);
  });
  it("rejects colliding generated IDs and invalid source pages", () => {
    expect(applyPageChanges(page, [add], catalog, () => "coupon-1").success).toBe(false);
    expect(applyPageChanges({ ...page, components: [page.components[0], page.components[0]] }, [update], catalog).success).toBe(false);
  });
});
