import type { AgentRequest, AgentResponse } from "@mpp/schema";

export class AgentApiError extends Error {
  constructor(readonly category: string, readonly status: number, message: string) {
    super(message);
    this.name = "AgentApiError";
  }
}

export async function requestAgent(payload: AgentRequest): Promise<AgentResponse> {
  let response: Response;
  try {
    response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  } catch {
    throw new AgentApiError("connection", 0, "Could not reach the agent server. Check that pnpm dev started agent-server.");
  }
  let body: AgentResponse | { error: { category: string; status: number; message: string } };
  try {
    body = await response.json() as typeof body;
  } catch {
    throw new AgentApiError("connection", response.status, "The agent server returned an unreadable response. Check that agent-server is running and its /api proxy is connected.");
  }
  if (!response.ok) {
    const error = "error" in body ? body.error : null;
    throw new AgentApiError(error?.category ?? "upstream", error?.status ?? response.status, error?.message ?? "Unable to generate proposal.");
  }
  return body as AgentResponse;
}
