import type { AgentToolName } from "@mpp/schema";
import type { AgentModelAdapter, AgentModelTurn } from "./agent";

export type ProviderErrorCategory = "configuration" | "authentication" | "rate_limit" | "connection" | "tool_call_format" | "upstream";

export class ProviderError extends Error {
  constructor(readonly category: ProviderErrorCategory, readonly status: number, readonly upstreamStatus: number | null, message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface AgentToolDefinition {
  type: "function";
  function: { name: AgentToolName; description: string; parameters: Record<string, unknown> };
}

const emptyArguments = { type: "object", properties: {}, additionalProperties: false };

export const agentToolDefinitions: AgentToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_components",
      description: "List the components available for page construction.",
      parameters: emptyArguments
    }
  },
  {
    type: "function",
    function: {
      name: "get_component_definition",
      description: "Get serializable defaults and configurable fields for one listed component.",
      parameters: {
        type: "object",
        properties: { type: { type: "string", description: "Component type from list_components" } },
        required: ["type"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_current_page",
      description: "Read the current editable page draft.",
      parameters: emptyArguments
    }
  },
  {
    type: "function",
    function: {
      name: "submit_page_layout",
      description: "Submit a complete replacement page layout for deterministic validation.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Optional page title; defaults to the current title." },
          components: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", description: "Component type from list_components." },
                props: { type: "object", additionalProperties: true, description: "Only keys declared by that component configSchema are accepted." }
              },
              required: ["type"],
              additionalProperties: false
            }
          }
        },
        required: ["components"],
        additionalProperties: false
      }
    }
  }
];

export interface AgentChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export class OpenAICompatibleModelAdapter implements AgentModelAdapter {
  constructor(private readonly config: { apiKey: string; baseUrl: string; model: string }) {}

  async complete(input: { messages: AgentChatMessage[]; tools: AgentToolDefinition[] }): Promise<AgentModelTurn> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({ model: this.config.model, messages: input.messages, tools: input.tools })
      });
    } catch {
      throw new ProviderError("connection", 503, null, "Could not connect to the AI provider.");
    }
    if (!response.ok) {
      const category = response.status === 401 || response.status === 403
        ? "authentication"
        : response.status === 429
          ? "rate_limit"
          : response.status === 400 || response.status === 422
            ? "tool_call_format"
            : "upstream";
      throw new ProviderError(category, 502, response.status, "The AI provider rejected or failed the request.");
    }

    let body: { choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }> } }> };
    try {
      body = await response.json() as typeof body;
    } catch {
      throw new ProviderError("tool_call_format", 502, response.status, "The AI provider returned an invalid response format.");
    }
    const message = body.choices?.[0]?.message;
    if (!message || (message.tool_calls !== undefined && !Array.isArray(message.tool_calls))) {
      throw new ProviderError("tool_call_format", 502, response.status, "The AI provider returned an invalid tool-calling response.");
    }
    const toolCalls = (message.tool_calls ?? []).map((call) => {
      if (call.type !== "function" || !call.id || !call.function?.name || typeof call.function.arguments !== "string") {
        throw new ProviderError("tool_call_format", 502, response.status, "The AI provider returned a malformed tool call.");
      }
      return { id: call.id, name: call.function.name, arguments: call.function.arguments };
    });
    return { content: message.content ?? null, toolCalls };
  }
}
