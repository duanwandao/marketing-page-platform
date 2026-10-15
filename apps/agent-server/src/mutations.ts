import { randomUUID } from "node:crypto";
import type { AgentComponentDefinition, PageChange, PageSchema } from "@mpp/schema";
import { isRecord, validatePageSchema, validateProps } from "./validator";

export type MutationResult = { success: true; page: PageSchema } | { success: false; errors: string[] };

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function extraFields(value: Record<string, unknown>, allowed: string[]): string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key)).map((key) => `Unexpected field: ${key}`);
}

function validateChange(value: unknown): string[] {
  if (!isRecord(value)) return ["operation must be an object"];
  if (value.operation === "update_component") {
    const errors = extraFields(value, ["operation", "componentId", "props"]);
    if (!nonemptyString(value.componentId)) errors.push("componentId must be a nonempty string");
    if (!isRecord(value.props) || !Object.keys(value.props).length) errors.push("props must be a nonempty object");
    return errors;
  }
  if (value.operation === "remove_component") {
    const errors = extraFields(value, ["operation", "componentId"]);
    if (!nonemptyString(value.componentId)) errors.push("componentId must be a nonempty string");
    return errors;
  }
  if (value.operation === "add_component") {
    const errors = extraFields(value, ["operation", "component", "beforeComponentId"]);
    if (Object.hasOwn(value, "beforeComponentId") && !nonemptyString(value.beforeComponentId)) errors.push("beforeComponentId must be a nonempty string");
    if (!isRecord(value.component)) return [...errors, "component must be an object"];
    errors.push(...extraFields(value.component, ["type", "props"]));
    if (!nonemptyString(value.component.type)) errors.push("component.type must be a nonempty string");
    if (Object.hasOwn(value.component, "props") && !isRecord(value.component.props)) errors.push("component.props must be an object");
    return errors;
  }
  return [`Unknown operation: ${String(value.operation)}`];
}

export function applyPageChanges(
  currentPage: PageSchema,
  changes: unknown,
  catalog: AgentComponentDefinition[],
  createId: (type: string) => string = (type) => `${type.toLowerCase()}-${randomUUID()}`
): MutationResult {
  const sourceErrors = validatePageSchema(currentPage, catalog);
  if (sourceErrors.length) return { success: false, errors: sourceErrors };
  if (!Array.isArray(changes) || !changes.length) return { success: false, errors: ["changes must be a nonempty array"] };
  const page = structuredClone(currentPage);
  for (const [index, raw] of changes.entries()) {
    const fail = (errors: string[]): MutationResult => ({ success: false, errors: errors.map((message) => `changes[${index}]: ${message}`) });
    const formatErrors = validateChange(raw);
    if (formatErrors.length) return fail(formatErrors);
    // The runtime parser above checks the discriminated union before this cast.
    const change = raw as PageChange;
    if (change.operation === "add_component") {
      const props = change.component.props ?? {};
      const errors = validateProps(change.component.type, props, catalog);
      if (errors.length) return fail(errors);
      const definition = catalog.find((item) => item.type === change.component.type)!;
      const position = change.beforeComponentId === undefined ? page.components.length
        : page.components.findIndex((component) => component.id === change.beforeComponentId);
      if (position < 0) return fail([`Unknown insertion anchor: ${change.beforeComponentId}`]);
      const id = createId(definition.type);
      if (!nonemptyString(id) || page.components.some((component) => component.id === id)) return fail([`Invalid or duplicate generated component id: ${id}`]);
      page.components.splice(position, 0, { id, type: definition.type, props: { ...structuredClone(definition.defaultProps), ...structuredClone(props) } });
    } else {
      const position = page.components.findIndex((component) => component.id === change.componentId);
      if (position < 0) return fail([`Unknown component id: ${change.componentId}`]);
      if (change.operation === "remove_component") page.components.splice(position, 1);
      else {
        const component = page.components[position];
        const errors = validateProps(component.type, change.props, catalog);
        if (errors.length) return fail(errors);
        page.components[position] = { ...component, props: { ...component.props, ...structuredClone(change.props) } };
      }
    }
    const pageErrors = validatePageSchema(page, catalog);
    if (pageErrors.length) return fail(pageErrors);
  }
  return { success: true, page };
}
