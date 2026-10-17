import { describe, expect, it } from "vitest";
import { diffPageSchemas } from "./schema-diff";
const page = { schemaVersion: 1 as const, id: "page-1", title: "Draft", components: [{ id: "coupon-1", type: "Coupon", props: { amount: 20, title: "A" } }, { id: "banner-1", type: "Banner", props: { title: "Sale" } }] };
describe("diffPageSchemas", () => {
  it("reports only a changed property for stable IDs", () => { expect(diffPageSchemas(page, { ...page, components: [{ ...page.components[0], props: { ...page.components[0].props, amount: 50 } }, page.components[1]] })).toEqual([{ kind: "prop_updated", componentId: "coupon-1", componentType: "Coupon", propKey: "amount", before: 20, after: 50 }]); });
  it("reports title and add/remove without a false move after index shifts", () => { expect(diffPageSchemas(page, { ...page, title: "New", components: [{ id: "new", type: "Text", props: {} }, page.components[1]] })).toEqual([{ kind: "title_changed", before: "Draft", after: "New" }, { kind: "component_removed", componentId: "coupon-1", componentType: "Coupon", index: 0 }, { kind: "component_added", componentId: "new", componentType: "Text", index: 0 }]); });
  it("reports order changes among surviving components", () => { expect(diffPageSchemas(page, { ...page, components: [...page.components].reverse() }).filter((entry) => entry.kind === "component_moved")).toHaveLength(2); });
});
