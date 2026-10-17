import { describe, expect, it } from "vitest";
import type { AgentRequest } from "@mpp/schema";
import { runAgent, type AgentModelAdapter } from "./agent";

const request: AgentRequest = { instruction: "Make a page", currentPage: { schemaVersion: 1, id: "page-1", title: "Draft", components: [] }, componentCatalog: [{ type: "Coupon", name: "Coupon", defaultProps: { title: "Coupon", amount: 20 }, configSchema: [{ key: "title", label: "Title", type: "text" }, { key: "amount", label: "Amount", type: "number" }] }] };

class ScriptedModel implements AgentModelAdapter {
  private index = 0;
  readonly inputs: Array<{ messages: unknown[]; tools: unknown[] }> = [];
  constructor(private readonly turns: Array<{ content?: string; toolCalls?: Array<{ id: string; name: string; arguments: string }> }>) {}
  async complete(input: { messages: unknown[]; tools: unknown[] }) { this.inputs.push(input); return this.turns[this.index++] ?? { content: "Done" }; }
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

  it("records standard assistant calls and one tool observation for every call in a parallel turn", async () => {
    const model = new ScriptedModel([
      { toolCalls: [{ id: "list-1", name: "list_components", arguments: "{}" }, { id: "page-1", name: "get_current_page", arguments: "{}" }] },
      { content: "No layout submitted." }
    ]);
    const result = await runAgent({ request, model });
    const second = model.inputs[1];
    expect(result.trace).toHaveLength(2);
    expect(second?.messages).toContainEqual({ role: "assistant", content: null, tool_calls: [
      { id: "list-1", type: "function", function: { name: "list_components", arguments: "{}" } },
      { id: "page-1", type: "function", function: { name: "get_current_page", arguments: "{}" } }
    ] });
    expect(second?.messages).toContainEqual({ role: "tool", tool_call_id: "list-1", content: JSON.stringify([{ type: "Coupon", name: "Coupon" }]) });
    expect(second?.messages).toContainEqual({ role: "tool", tool_call_id: "page-1", content: JSON.stringify(request.currentPage) });
  });
});

describe("incremental editing agent", () => {
  const currentPage = { ...request.currentPage, components: [{ id: "coupon-existing", type: "Coupon", props: { title: "Special", amount: 20 } }] };
  const call = (id: string, name: string, args: unknown) => ({ id, name, arguments: JSON.stringify(args) });

  it("sends editing and ambiguity guidance to the model", async () => {
    const model = new ScriptedModel([{ content: "Which coupon?" }]);
    await runAgent({ request, model });
    const system = model.inputs[0].messages[0] as { content: string };
    for (const rule of ["get_current_page", "apply_page_changes", "submit_page_layout", "exact component IDs", "clarification", "source of truth"]) {
      expect(system.content).toContain(rule);
    }
  });

  it("repairs an invalid patch from indexed tool feedback", async () => {
    const model = new ScriptedModel([
      { toolCalls: [call("read", "get_current_page", {})] },
      { toolCalls: [call("bad", "apply_page_changes", { changes: [{ operation: "update_component", componentId: "coupon-existing", props: { amount: "50" } }] })] },
      { toolCalls: [call("good", "apply_page_changes", { changes: [{ operation: "update_component", componentId: "coupon-existing", props: { amount: 50 } }] })] },
      { content: "Discount updated." }
    ]);
    const result = await runAgent({ request: { ...request, currentPage }, model });
    expect(result.proposedSchema).toEqual({ ...currentPage, components: [{ id: "coupon-existing", type: "Coupon", props: { title: "Special", amount: 50 } }] });
    expect(model.inputs[2].messages).toContainEqual({ role: "tool", tool_call_id: "bad", content: JSON.stringify({ success: false, errors: ["changes[0]: Coupon.amount must be a number"] }) });
    expect(result.trace.map((event) => event.outcome)).toEqual(["success", "error", "success"]);
  });

  it("edits a server-generated ID in a later tool call using working-page feedback", async () => {
    let turn = 0;
    const model: AgentModelAdapter = {
      async complete({ messages }) {
        turn += 1;
        if (turn === 1) return { toolCalls: [call("add", "apply_page_changes", { changes: [{ operation: "add_component", component: { type: "Coupon" } }] })] };
        if (turn === 2) return { toolCalls: [call("read", "get_current_page", {})] };
        if (turn === 3) {
          const added = JSON.parse(messages.find((message) => message.tool_call_id === "add")!.content!).page;
          const read = JSON.parse(messages.find((message) => message.tool_call_id === "read")!.content!);
          expect(read).toEqual(added);
          return { toolCalls: [call("update", "apply_page_changes", { changes: [{ operation: "update_component", componentId: read.components[0].id, props: { amount: 50 } }] })] };
        }
        return { content: "Proposal ready." };
      }
    };
    const result = await runAgent({ request, model });
    expect(result.proposedSchema?.components).toHaveLength(1);
    expect(result.proposedSchema?.components[0]).toMatchObject({ id: expect.stringMatching(/^coupon-/), props: { title: "Coupon", amount: 50 } });
    expect(request.currentPage.components).toEqual([]);
  });

  it("returns a clarification without a proposal for ambiguous targets", async () => {
    const model = new ScriptedModel([
      { toolCalls: [call("read", "get_current_page", {})] },
      { content: "Which coupon should I update: Special or Second?" }
    ]);
    const result = await runAgent({ request: { ...request, currentPage: { ...currentPage, components: [currentPage.components[0], { id: "coupon-second", type: "Coupon", props: { title: "Second", amount: 30 } }] } }, model });
    expect(result.message).toBe("Which coupon should I update: Special or Second?");
    expect(result.proposedSchema).toBeNull();
    expect(result.trace.map((event) => event.toolName)).toEqual(["get_current_page"]);
  });

  it("places trusted system prompt, prior conversation and new instruction in order", async () => {
    const model = new ScriptedModel([{ content: "I will update the second coupon." }]);
    await runAgent({ request: { ...request, history: [{ role: "assistant", content: "Which coupon?" }, { role: "user", content: "The second one." }] }, model });
    expect(model.inputs[0].messages.slice(0, 4)).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "assistant", content: "Which coupon?" },
      { role: "user", content: "The second one." },
      { role: "user", content: request.instruction }
    ]);
  });

  it("uses a clarification follow-up to select the second stable component ID", async () => {
    const page = { ...currentPage, components: [currentPage.components[0], { id: "coupon-second", type: "Coupon", props: { title: "Second", amount: 30 } }] };
    const model: AgentModelAdapter = {
      async complete({ messages }) {
        if (messages.at(-1)?.role === "user" && messages.at(-1)?.content === "The second one") {
          expect(messages.slice(1, 3)).toEqual([{ role: "assistant", content: "Which coupon?" }, { role: "user", content: "The first or second one?" }]);
          return { toolCalls: [call("update", "apply_page_changes", { changes: [{ operation: "update_component", componentId: "coupon-second", props: { amount: 50 } }] })] };
        }
        return { content: "Proposal ready." };
      }
    };
    const result = await runAgent({ request: { ...request, currentPage: page, instruction: "The second one", history: [{ role: "assistant", content: "Which coupon?" }, { role: "user", content: "The first or second one?" }] }, model });
    expect(result.proposedSchema?.components[1]).toEqual({ id: "coupon-second", type: "Coupon", props: { title: "Second", amount: 50 } });
  });

  it("returns no proposal on eight-iteration exhaustion even after a successful edit", async () => {
    const model = new ScriptedModel(Array.from({ length: 9 }, (_, index) => ({ toolCalls: [call(String(index), "apply_page_changes", { changes: [{ operation: "update_component", componentId: "coupon-existing", props: { amount: 50 } }] })] })));
    const result = await runAgent({ request: { ...request, currentPage }, model });
    expect(model.inputs).toHaveLength(8);
    expect(result.proposedSchema).toBeNull();
    expect(result.trace).toHaveLength(8);
  });

  it("feeds unknown-tool and malformed-JSON errors back to the model", async () => {
    const model = new ScriptedModel([
      { toolCalls: [call("unknown", "missing_tool", {})] },
      { toolCalls: [{ id: "bad-json", name: "apply_page_changes", arguments: "{" }] },
      { content: "Please clarify your request." }
    ]);
    const result = await runAgent({ request, model });
    expect(result.trace.map((event) => event.outcome)).toEqual(["error", "error"]);
    expect(model.inputs[2].messages).toContainEqual({ role: "tool", tool_call_id: "bad-json", content: JSON.stringify({ success: false, errors: ["Tool arguments must be valid JSON"] }) });
    expect(result.proposedSchema).toBeNull();
  });
});
