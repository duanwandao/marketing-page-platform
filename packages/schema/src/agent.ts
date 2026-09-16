import type { PageSchema } from "./page";

export const agentToolNames = [
  "list_components",
  "get_component_definition",
  "get_current_page",
  "submit_page_layout"
] as const;

export type AgentToolName = (typeof agentToolNames)[number];
export type AgentConfigFieldType = "text" | "number" | "image" | "color" | "switch";

export interface AgentConfigField {
  key: string;
  label: string;
  type: AgentConfigFieldType;
}

export interface AgentComponentDefinition {
  type: string;
  name: string;
  defaultProps: Record<string, unknown>;
  configSchema: AgentConfigField[];
}

export interface AgentRequest {
  instruction: string;
  currentPage: PageSchema;
  componentCatalog: AgentComponentDefinition[];
}

export interface AgentTraceEvent {
  toolName: string;
  arguments: Record<string, unknown>;
  outcome: "success" | "error";
  summary: string;
}

export interface AgentResponse {
  message: string;
  proposedSchema: PageSchema | null;
  trace: AgentTraceEvent[];
}
