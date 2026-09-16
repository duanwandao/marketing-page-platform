import { describe, expect, it } from "vitest";
import type { AgentRequest } from "@mpp/schema";
import { runAgent, type AgentModelAdapter } from "./agent";

const request: AgentRequest = { instruction: "Make a page", currentPage: { schemaVersion: 1, id: "page-1", title: "Draft", components: [] }, componentCatalog: [{ type: "Coupon", name: "Coupon", defaultProps: { title: "Coupon", amount: 20 }, configSchema: [{ key: "title", label: "Title", type: "text" }, { key: "amount", label: "Amount", type: "number" }] }] };

class ScriptedModel implements AgentModelAdapter {
  private index = 0;
  constructor(private readonly turns: Array<{ content?: string; toolCalls?: Array<{ id: string; name: string; arguments: string }> }>) {}
  async complete() { return this.turns[this.index++] ?? { content: "Done" }; }
}

describe("agent loop", () => {
  it("returns a repaired proposal after feeding validation errors back to the model", async () => {
    const model = new ScriptedModel([
      { toolCalls: [{ id: "1", name: "list_components", arguments: "{}" }] },
      { toolCalls: [{ id: "2", name: "get_component_definition", arguments: '{"type":"Coupon"}' }] },
      { toolCalls: [{ id: "3", name: "submit_page_layout", arguments: '{"components":[{"type":"Coupon","props":{"amount":"30"}}]}' }] },
      { toolCalls: [{ id: "4", name: "submit_page_layout", arguments: '{"components":[{"type":"Coupon","props":{"amount":30}}]}' }] },
      { content: "Proposal ready." }
    ]);
    const result = await runAgent({ request, model });
    expect(result.message).toBe("Proposal ready.");
    expect(result.proposedSchema?.components[0].props).toEqual({ title: "Coupon", amount: 30 });
    expect(result.trace.map((item) => item.outcome)).toContain("error");
  });
});
