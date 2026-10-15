import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRequest } from "@mpp/schema";
import { runAgent } from "./agent";
import { OpenAICompatibleModelAdapter } from "./provider";

const request: AgentRequest = {
  instruction: "Create a coupon page",
  currentPage: { schemaVersion: 1, id: "page-1", title: "Draft", components: [] },
  componentCatalog: [{ type: "Coupon", name: "Coupon", defaultProps: { title: "Coupon" }, configSchema: [{ key: "title", label: "Title", type: "text" }] }]
};

function upstreamTurn(message: unknown) {
  return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("OpenAI-compatible tool protocol", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends JSON Schemas and replays standard assistant/tool messages on later model turns", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const replies = [
      upstreamTurn({ role: "assistant", content: null, tool_calls: [{ id: "call-list", type: "function", function: { name: "list_components", arguments: "{}" } }] }),
      upstreamTurn({ role: "assistant", content: null, tool_calls: [{ id: "call-layout", type: "function", function: { name: "submit_page_layout", arguments: '{"title":"Coupons","components":[{"type":"Coupon","props":{"title":"Save today"}}]}' } }] }),
      upstreamTurn({ role: "assistant", content: "Proposal ready.", tool_calls: [] })
    ];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return replies.shift()!;
    }));

    const model = new OpenAICompatibleModelAdapter({ apiKey: "test-secret", baseUrl: "https://provider.test/v1", model: "test-model" });
    const result = await runAgent({ request, model });

    expect(requests).toHaveLength(3);
    const tools = requests[0].tools as Array<{ function: { name: string; parameters: Record<string, unknown> } }>;
    const params = (name: string) => tools.find((tool) => tool.function.name === name)!.function.parameters;
    expect(params("list_components")).toEqual({ type: "object", properties: {}, additionalProperties: false });
    expect(params("get_current_page")).toEqual({ type: "object", properties: {}, additionalProperties: false });
    expect(params("get_component_definition")).toMatchObject({ required: ["type"], properties: { type: { type: "string", description: "Component type from list_components" } } });
    expect(params("submit_page_layout")).toMatchObject({
      required: ["components"],
      properties: {
        title: { type: "string" },
        components: { type: "array", items: { type: "object", required: ["type"], properties: { type: { type: "string" }, props: { type: "object", additionalProperties: true } } } }
      }
    });

    expect(params("apply_page_changes")).toMatchObject({
      required: ["changes"], additionalProperties: false,
      properties: { changes: { type: "array", minItems: 1, items: { oneOf: [
        { additionalProperties: false, required: ["operation", "componentId", "props"], properties: { operation: { const: "update_component" }, props: { type: "object", minProperties: 1 } } },
        { additionalProperties: false, required: ["operation", "component"], properties: { operation: { const: "add_component" }, component: { additionalProperties: false, required: ["type"] } } },
        { additionalProperties: false, required: ["operation", "componentId"], properties: { operation: { const: "remove_component" } } }
      ] } } }
    });

    const secondMessages = requests[1].messages as Array<Record<string, unknown>>;
    expect(secondMessages).toContainEqual({ role: "assistant", content: null, tool_calls: [{ id: "call-list", type: "function", function: { name: "list_components", arguments: "{}" } }] });
    expect(secondMessages).toContainEqual({ role: "tool", tool_call_id: "call-list", content: JSON.stringify([{ type: "Coupon", name: "Coupon" }]) });
    const thirdMessages = requests[2].messages as Array<Record<string, unknown>>;
    expect(thirdMessages).toContainEqual({ role: "assistant", content: null, tool_calls: [{ id: "call-layout", type: "function", function: { name: "submit_page_layout", arguments: '{"title":"Coupons","components":[{"type":"Coupon","props":{"title":"Save today"}}]}' } }] });
    expect(thirdMessages).toContainEqual({ role: "tool", tool_call_id: "call-layout", content: JSON.stringify({ success: true, componentCount: 1, page: result.proposedSchema }) });
    expect(result.proposedSchema?.components[0].props.title).toBe("Save today");
  });

  it("classifies provider authentication failures without including response credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"Bearer do-not-leak"}', { status: 401 })));
    const model = new OpenAICompatibleModelAdapter({ apiKey: "test-secret", baseUrl: "https://provider.test/v1", model: "test-model" });
    const failure = await model.complete({ messages: [], tools: [] }).catch((cause: unknown) => cause);
    expect(failure).toMatchObject({ category: "authentication", status: 502, upstreamStatus: 401 });
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain("do-not-leak");
  });

  it("classifies an upstream tool schema rejection as a tool-calling format error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"unsupported tools"}', { status: 400 })));
    const model = new OpenAICompatibleModelAdapter({ apiKey: "test-secret", baseUrl: "https://provider.test/v1", model: "test-model" });
    const failure = await model.complete({ messages: [], tools: [] }).catch((cause: unknown) => cause);
    expect(failure).toMatchObject({ category: "tool_call_format", status: 502, upstreamStatus: 400 });
  });
});
