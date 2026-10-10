import { agentToolNames, type AgentRequest, type AgentResponse, type AgentToolName, type PageSchema } from "@mpp/schema";
import { agentToolDefinitions, type AgentChatMessage, type AgentToolDefinition } from "./provider";
import { createAgentTools } from "./tools";

export interface AgentToolCall { id: string; name: string; arguments: string; }
export interface AgentModelTurn { content?: string | null; toolCalls?: AgentToolCall[]; }
export interface AgentModelAdapter {
  complete(input: { messages: AgentChatMessage[]; tools: AgentToolDefinition[] }): Promise<AgentModelTurn>;
}

export async function runAgent({ request, model, maxIterations = 8 }: { request: AgentRequest; model: AgentModelAdapter; maxIterations?: number }): Promise<AgentResponse> {
  const executor = createAgentTools(request);
  const trace: AgentResponse["trace"] = [];
  const messages: AgentChatMessage[] = [
    { role: "system", content: "Use the available tools to propose a valid marketing page layout. Submit a layout before finalizing." },
    { role: "user", content: request.instruction }
  ];
  let proposedSchema: PageSchema | null = null;
  for (let iteration = 0; iteration < Math.min(maxIterations, 8); iteration += 1) {
    const turn = await model.complete({ messages, tools: agentToolDefinitions });
    const calls = turn.toolCalls ?? [];
    if (calls.length === 0) {
      return { message: proposedSchema ? (turn.content || "Proposal ready.") : "The assistant finished without a valid page proposal.", proposedSchema, trace };
    }

    messages.push({
      role: "assistant",
      content: turn.content ?? null,
      tool_calls: calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } }))
    });
    for (const call of calls) {
      let arguments_: unknown;
      try { arguments_ = JSON.parse(call.arguments); } catch { arguments_ = null; }
      const knownTool = (agentToolNames as readonly string[]).includes(call.name);
      const result = !knownTool
        ? {
            success: false,
            observation: { success: false, errors: [`Unknown tool: ${call.name}`] },
            trace: { toolName: call.name, arguments: {}, outcome: "error" as const, summary: "Unknown tool" }
          }
        : arguments_ === null
          ? {
              success: false,
              observation: { success: false, errors: ["Tool arguments must be valid JSON"] },
              trace: { toolName: call.name, arguments: {}, outcome: "error" as const, summary: "Tool arguments must be valid JSON" }
            }
          : executor.execute(call.name as AgentToolName, arguments_);
      trace.push(result.trace);
      if (result.proposedSchema) proposedSchema = result.proposedSchema;
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result.observation) });
    }
  }
  return { message: "The agent reached its maximum of 8 tool iterations without finishing.", proposedSchema: null, trace };
}
