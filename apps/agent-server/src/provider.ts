import type { AgentModelAdapter, AgentModelTurn } from "./agent";

export class OpenAICompatibleModelAdapter implements AgentModelAdapter {
  constructor(private readonly config: { apiKey: string; baseUrl: string; model: string }) {}
  async complete(input: { messages: unknown[]; tools: unknown[] }): Promise<AgentModelTurn> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` }, body: JSON.stringify({ model: this.config.model, messages: input.messages, tools: input.tools.map((name) => ({ type: "function", function: { name, description: name, parameters: { type: "object" } } })) }) });
    if (!response.ok) throw new Error("Provider request failed");
    const body = await response.json() as { choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }> };
    const message = body.choices?.[0]?.message;
    return { content: message?.content ?? "", toolCalls: message?.tool_calls?.map((call) => ({ id: call.id, name: call.function.name, arguments: call.function.arguments })) ?? [] };
  }
}
