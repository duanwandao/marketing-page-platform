import type { AgentRequest, AgentResponse, AgentToolName } from "@mpp/schema";
import { createAgentTools } from "./tools";

export interface AgentToolCall { id: string; name: string; arguments: string; }
export interface AgentModelTurn { content?: string; toolCalls?: AgentToolCall[]; }
export interface AgentModelAdapter { complete(input: { messages: unknown[]; tools: unknown[] }): Promise<AgentModelTurn>; }

const tools = ["list_components", "get_component_definition", "get_current_page", "submit_page_layout"];

export async function runAgent({ request, model, maxIterations = 8 }: { request: AgentRequest; model: AgentModelAdapter; maxIterations?: number }): Promise<AgentResponse> {
  const executor = createAgentTools(request);
  const trace = [] as AgentResponse["trace"];
  const messages: unknown[] = [{ role: "system", content: "Use the available tools to propose a valid marketing page layout. Submit a layout before finalizing." }, { role: "user", content: request.instruction }];
  let proposedSchema = null;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let turn: AgentModelTurn;
    try { turn = await model.complete({ messages, tools }); } catch { return { message: "The AI provider could not complete this request.", proposedSchema: null, trace }; }
    const calls = turn.toolCalls ?? [];
    if (calls.length === 0) return { message: proposedSchema ? (turn.content || "Proposal ready.") : "The assistant finished without a valid page proposal.", proposedSchema, trace };
    messages.push({ role: "assistant", content: turn.content ?? "", tool_calls: calls });
    for (const call of calls) {
      let arguments_: unknown;
      try { arguments_ = JSON.parse(call.arguments); } catch { arguments_ = null; }
      if (!tools.includes(call.name)) {
        trace.push({ toolName: call.name, arguments: {}, outcome: "error", summary: "Unknown tool" });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ success: false, errors: ["Unknown tool"] }) });
        continue;
      }
      const result = arguments_ === null
        ? { success: false, observation: { success: false, errors: ["Tool arguments must be valid JSON"] }, trace: { toolName: call.name, arguments: {}, outcome: "error" as const, summary: "Tool arguments must be valid JSON" } }
        : executor.execute(call.name as AgentToolName, arguments_);
      trace.push(result.trace);
      if (result.proposedSchema) proposedSchema = result.proposedSchema;
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result.observation) });
    }
  }
  return { message: "The agent reached its maximum of 8 tool iterations without finishing.", proposedSchema: null, trace };
}
