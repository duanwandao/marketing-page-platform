import type {
  AgentComponentDefinition,
  AgentRequest,
  AgentToolName,
  AgentTraceEvent,
  PageSchema
} from "@mpp/schema";

export interface ToolExecutionResult {
  success: boolean;
  observation: unknown;
  proposedSchema?: PageSchema;
  trace: AgentTraceEvent;
}

export interface AgentTools {
  execute(name: AgentToolName, arguments_: unknown): ToolExecutionResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidFieldValue(type: AgentComponentDefinition["configSchema"][number]["type"], value: unknown) {
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "switch") return typeof value === "boolean";
  return typeof value === "string";
}

function sanitize(value: unknown, key = ""): unknown {
  if (/api.?key|authorization|secret|token|credential|password/i.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitize(child, childKey)]));
  return value;
}

function trace(name: string, arguments_: unknown, outcome: "success" | "error", summary: string): AgentTraceEvent {
  return { toolName: name, arguments: isRecord(arguments_) ? sanitize(arguments_) as Record<string, unknown> : {}, outcome, summary };
}

function error(name: AgentToolName, arguments_: unknown, errors: string[]): ToolExecutionResult {
  return {
    success: false,
    observation: { success: false, errors },
    trace: trace(name, arguments_, "error", errors.join(" "))
  };
}

function normalizeLayout(request: AgentRequest, rawArguments: unknown): ToolExecutionResult {
  if (!isRecord(rawArguments) || !Array.isArray(rawArguments.components)) {
    return error("submit_page_layout", rawArguments, ["components must be an array"]);
  }
  if (rawArguments.title !== undefined && typeof rawArguments.title !== "string") {
    return error("submit_page_layout", rawArguments, ["title must be a string"]);
  }

  const errors: string[] = [];
  const components = rawArguments.components.map((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.type !== "string") {
      errors.push(`components[${index}] must include a component type`);
      return null;
    }
    const definition = request.componentCatalog.find((item) => item.type === candidate.type);
    if (!definition) {
      errors.push(`Unknown component type: ${candidate.type}`);
      return null;
    }
    if (candidate.props !== undefined && !isRecord(candidate.props)) {
      errors.push(`${candidate.type}.props must be an object`);
      return null;
    }
    const props = structuredClone(definition.defaultProps);
    const overrides = candidate.props ?? {};
    for (const [key, value] of Object.entries(overrides)) {
      const field = definition.configSchema.find((item) => item.key === key);
      if (!field) {
        errors.push(`${candidate.type}.${key} is not configurable`);
      } else if (!isValidFieldValue(field.type, value)) {
        errors.push(`${candidate.type}.${key} must be ${field.type === "number" ? "a number" : field.type === "switch" ? "a boolean" : "a string"}`);
      } else {
        props[key] = value;
      }
    }
    return { id: `${candidate.type.toLowerCase()}-${index + 1}`, type: candidate.type, props };
  });

  if (errors.length > 0 || components.some((component) => component === null)) {
    return error("submit_page_layout", rawArguments, errors);
  }

  const proposedSchema: PageSchema = {
    schemaVersion: request.currentPage.schemaVersion,
    id: request.currentPage.id,
    title: rawArguments.title ?? request.currentPage.title,
    components: components as PageSchema["components"]
  };
  return {
    success: true,
    observation: { success: true, componentCount: proposedSchema.components.length },
    proposedSchema,
    trace: trace("submit_page_layout", rawArguments, "success", `Proposal accepted with ${proposedSchema.components.length} components`)
  };
}

export function createAgentTools(request: AgentRequest): AgentTools {
  return {
    execute(name, arguments_) {
      switch (name) {
        case "list_components": {
          const observation = request.componentCatalog.map(({ type, name: componentName }) => ({ type, name: componentName }));
          return {
            success: true,
            observation,
            trace: trace(name, arguments_, "success", `${observation.length} components available`)
          };
        }
        case "get_component_definition": {
          const type = isRecord(arguments_) ? arguments_.type : undefined;
          const definition = typeof type === "string" ? request.componentCatalog.find((item) => item.type === type) : undefined;
          if (!definition) return error(name, arguments_, [`Unknown component type: ${String(type)}`]);
          return { success: true, observation: structuredClone(definition), trace: trace(name, arguments_, "success", `Loaded ${definition.type} definition`) };
        }
        case "get_current_page":
          return { success: true, observation: structuredClone(request.currentPage), trace: trace(name, arguments_, "success", `Loaded ${request.currentPage.title}`) };
        case "submit_page_layout":
          return normalizeLayout(request, arguments_);
      }
    }
  };
}
