import { describe, expect, it } from "vitest";
import { createEmptyPageSchema } from "./page";

describe("createEmptyPageSchema", () => {
  it("creates a versioned page schema with no components", () => {
    expect(createEmptyPageSchema({ id: "demo-page", title: "Demo Page" })).toEqual({
      schemaVersion: 1,
      id: "demo-page",
      title: "Demo Page",
      components: []
    });
  });
});
