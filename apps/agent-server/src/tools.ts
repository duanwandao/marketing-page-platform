import type {
  AgentRequest,
  AgentToolName,
  AgentTraceEvent,
  PageSchema
} from "@mpp/schema";

import { applyPageChanges } from "./mutations";
import { isRecord, validateProps, validatePageSchema } from "./validator";

export interface ToolExecutionResult {
  success: boolean;
  observation: unknown;
  proposedSchema?: PageSchema;
  trace: AgentTraceEvent;
}

export interface AgentTools {
  execute(name: AgentToolName, arguments_: unknown): ToolExecutionResult;
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
    const overrides = candidate.props === undefined ? {} : candidate.props;
    const propErrors = validateProps(candidate.type, overrides, request.componentCatalog);
    errors.push(...propErrors.map((message) => `components[${index}]: ${message}`));
    const props = { ...structuredClone(definition.defaultProps), ...(isRecord(overrides) ? overrides : {}) };
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
  const pageErrors = validatePageSchema(proposedSchema, request.componentCatalog);
  if (pageErrors.length) return error("submit_page_layout", rawArguments, pageErrors);
  return {
    success: true,
    observation: { success: true, componentCount: proposedSchema.components.length, page: structuredClone(proposedSchema) },
    proposedSchema,
    trace: trace("submit_page_layout", rawArguments, "success", `Proposal accepted with ${proposedSchema.components.length} components`)
  };
}

export function createAgentTools(request: AgentRequest): AgentTools {
  let workingPage = structuredClone(request.currentPage);
  function accept(result: ToolExecutionResult): ToolExecutionResult {
    if (result.success && result.proposedSchema) workingPage = structuredClone(result.proposedSchema);
    return result;
  }
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
          return { success: true, observation: structuredClone(workingPage), trace: trace(name, arguments_, "success", `Loaded ${workingPage.title}`) };
        case "submit_page_layout":
          return accept(normalizeLayout({ ...request, currentPage: workingPage }, arguments_));
        case "apply_page_changes": {
          if (!isRecord(arguments_) || Object.keys(arguments_).some((key) => key !== "changes")) {
            return error(name, arguments_, ["Tool input must be an object containing only changes"]);
          }
          const result = applyPageChanges(workingPage, arguments_.changes, request.componentCatalog);
          if (!result.success) return error(name, arguments_, result.errors);
          return accept({
            success: true,
            observation: { success: true, page: structuredClone(result.page) },
            proposedSchema: result.page,
            trace: trace(name, arguments_, "success", `Proposal accepted with ${result.page.components.length} components`)
          });
        }
      }
    }
  };
}
