import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentRequest } from "@mpp/schema";
import type { AgentModelAdapter } from "./agent";
import { runAgent } from "./agent";

function send(response: ServerResponse, status: number, body: unknown) { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)); }
async function readBody(request: IncomingMessage): Promise<string> { let body = ""; for await (const chunk of request) { body += chunk; if (body.length > 262144) throw new Error("Request body is too large"); } return body; }
function valid(value: unknown): value is AgentRequest { return typeof value === "object" && value !== null && typeof (value as AgentRequest).instruction === "string" && (value as AgentRequest).instruction.trim().length > 0 && Array.isArray((value as AgentRequest).componentCatalog) && typeof (value as AgentRequest).currentPage?.id === "string" && Array.isArray((value as AgentRequest).currentPage?.components); }
export function createAgentHttpHandler(model: AgentModelAdapter) { return async (request: IncomingMessage, response: ServerResponse) => { if (request.url !== "/api/agent") return send(response, 404, { error: "Not found" }); if (request.method !== "POST") return send(response, 405, { error: "Method not allowed" }); try { const body: unknown = JSON.parse(await readBody(request)); if (!valid(body)) return send(response, 400, { error: "Invalid agent request" }); return send(response, 200, await runAgent({ request: body, model })); } catch { return send(response, 400, { error: "Invalid agent request" }); } }; }
