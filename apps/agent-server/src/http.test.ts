import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentModelAdapter } from "./agent";
import { createAgentHttpHandler } from "./http";
import { ProviderError } from "./provider";

const requestBody = { instruction: "Create a page", currentPage: { schemaVersion: 1, id: "page-1", title: "Draft", components: [] }, componentCatalog: [] };
const fakeModel: AgentModelAdapter = { complete: async () => ({ content: "No proposal." }) };

function makeRequest(method: string, url: string, body = ""): IncomingMessage {
  return { method, url, async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(body); } } as IncomingMessage;
}

function makeResponse() {
  let responseBody = "";
  const response = {
    writeHead: vi.fn(),
    end: vi.fn((body?: string) => { responseBody = body ?? ""; })
  } as unknown as ServerResponse;
  return { response, status: () => vi.mocked(response.writeHead).mock.calls[0]?.[0], body: () => JSON.parse(responseBody) as unknown };
}

async function invoke(handler: ReturnType<typeof createAgentHttpHandler>, method: string, url: string, body = "") {
  const output = makeResponse();
  await handler(makeRequest(method, url, body), output.response);
  return output;
}

describe("agent HTTP handler", () => {
  it("handles valid requests and rejects wrong method, route, and malformed input", async () => {
    const handler = createAgentHttpHandler(fakeModel);
    const good = await invoke(handler, "POST", "/api/agent", JSON.stringify(requestBody));
    expect(good.status()).toBe(200);
    expect(good.body()).toMatchObject({ message: "No proposal.", proposedSchema: null });
    expect((await invoke(handler, "GET", "/api/agent")).status()).toBe(405);
    expect((await invoke(handler, "POST", "/elsewhere")).status()).toBe(404);
    const bad = await invoke(handler, "POST", "/api/agent", "not-json");
    expect(bad.status()).toBe(400);
    expect(bad.body()).toEqual({ error: { category: "request", status: 400, message: "Invalid agent request." } });
  });

  it("reports missing configuration and sanitized provider failure categories", async () => {
    const missing = await invoke(createAgentHttpHandler(null), "POST", "/api/agent", JSON.stringify(requestBody));
    expect(missing.status()).toBe(503);
    expect(missing.body()).toMatchObject({ error: { category: "configuration", status: 503 } });

    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const brokenModel: AgentModelAdapter = { complete: async () => { throw new ProviderError("rate_limit", 502, 429, "The AI provider rejected or failed the request."); } };
    const failure = await invoke(createAgentHttpHandler(brokenModel), "POST", "/api/agent", JSON.stringify(requestBody));
    expect(failure.status()).toBe(502);
    const body = JSON.stringify(failure.body());
    expect(body).toContain('"category":"rate_limit"');
    expect(body).not.toContain("test-secret");
    expect(log).toHaveBeenCalledWith("[agent-server] provider failure", { category: "rate_limit", status: 502, upstreamStatus: 429 });
  });
});
