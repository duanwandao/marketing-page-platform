import type { AgentRequest, AgentResponse } from "@mpp/schema";
export async function requestAgent(payload: AgentRequest): Promise<AgentResponse> {
  const response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json() as AgentResponse | { error: string };
  if (!response.ok) throw new Error("error" in body ? body.error : "Unable to generate proposal.");
  return body as AgentResponse;
}
