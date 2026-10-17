import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentComponentDefinition, AgentRequest } from "@mpp/schema";
import type { AgentModelAdapter } from "./agent";
import { runAgent } from "./agent";
import { ProviderError } from "./provider";

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

class RequestBodyError extends Error {
  constructor(readonly status: number) { super("Invalid request body"); }
}

async function readBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 262144) throw new RequestBodyError(413);
  }
  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isComponentDefinition(value: unknown): value is AgentComponentDefinition {
  return isRecord(value) && typeof value.type === "string" && typeof value.name === "string" && isRecord(value.defaultProps) && Array.isArray(value.configSchema) && value.configSchema.every((field) => isRecord(field) && typeof field.key === "string" && typeof field.label === "string" && ["text", "number", "image", "color", "switch"].includes(String(field.type)));
}

function isAgentRequest(value: unknown): value is AgentRequest {
  if (!isRecord(value) || typeof value.instruction !== "string" || !value.instruction.trim() || !isRecord(value.currentPage) || !Array.isArray(value.currentPage.components) || !Array.isArray(value.componentCatalog)) return false;
  const page = value.currentPage;
  const historyValid = value.history === undefined || (
    Array.isArray(value.history) && value.history.length <= 12 &&
    value.history.every((message) => isRecord(message) && (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && message.content.length <= 1500) &&
    value.history.reduce((total, message) => total + (isRecord(message) && typeof message.content === "string" ? message.content.length : 0), 0) <= 12000
  );
  const workingCopyValid = value.workingCopyKind === undefined || value.workingCopyKind === "accepted_draft" || value.workingCopyKind === "pending_proposal";
  return page.schemaVersion === 1 && typeof page.id === "string" && typeof page.title === "string" && Array.isArray(page.components) && page.components.every((component) => isRecord(component) && typeof component.id === "string" && typeof component.type === "string" && isRecord(component.props)) && value.componentCatalog.every(isComponentDefinition) && historyValid && workingCopyValid;
}

function messageFor(category: string): string {
  switch (category) {
    case "configuration": return "AI server configuration is missing. Set AI_API_KEY and AI_MODEL in the project root .env file, then restart the server.";
    case "authentication": return "The AI provider rejected the credentials. Check AI_API_KEY and the provider account permissions.";
    case "rate_limit": return "The AI provider rate limit or quota has been reached. Check the provider quota and try again later.";
    case "connection": return "Could not connect to the AI provider. Check AI_BASE_URL and your network connection.";
    case "tool_call_format": return "The AI provider returned an incompatible tool-calling response. Check that the selected model supports OpenAI-compatible tool calling.";
    default: return "The AI provider request failed. Check AI_BASE_URL, AI_MODEL, and provider status.";
  }
}

export function createAgentHttpHandler(model: AgentModelAdapter | null) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.url !== "/api/agent") return send(response, 404, { error: { category: "request", status: 404, message: "Not found." } });
    if (request.method !== "POST") return send(response, 405, { error: { category: "request", status: 405, message: "Method not allowed." } });
    if (!model) return send(response, 503, { error: { category: "configuration", status: 503, message: messageFor("configuration") } });

    let body: unknown;
    try {
      body = JSON.parse(await readBody(request));
    } catch (cause) {
      const status = cause instanceof RequestBodyError ? cause.status : 400;
      return send(response, status, { error: { category: "request", status, message: status === 413 ? "Request body is too large." : "Invalid agent request." } });
    }
    if (!isAgentRequest(body)) return send(response, 400, { error: { category: "request", status: 400, message: "Invalid agent request." } });

    try {
      return send(response, 200, await runAgent({ request: body, model }));
    } catch (cause) {
      const providerError = cause instanceof ProviderError ? cause : null;
      const category = providerError?.category ?? "upstream";
      const status = providerError?.status ?? 502;
      const upstreamStatus = providerError?.upstreamStatus ?? null;
      console.error("[agent-server] provider failure", { category, status, upstreamStatus });
      return send(response, status, { error: { category, status, upstreamStatus, message: messageFor(category) } });
    }
  };
}
