import type { AgentComponentDefinition, AgentConfigFieldType } from "@mpp/schema";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateField(type: string, key: string, fieldType: AgentConfigFieldType, value: unknown): string[] {
  const valid = fieldType === "number" ? typeof value === "number" && Number.isFinite(value)
    : fieldType === "switch" ? typeof value === "boolean" : typeof value === "string";
  const expected = fieldType === "number" ? "a number" : fieldType === "switch" ? "a boolean" : "a string";
  return valid ? [] : [`${type}.${key} must be ${expected}`];
}

export function validateProps(componentType: string, props: unknown, catalog: AgentComponentDefinition[]): string[] {
  const definition = catalog.find((item) => item.type === componentType);
  if (!definition) return [`Unknown component type: ${componentType}`];
  if (!isRecord(props)) return [`${componentType}.props must be an object`];
  return Object.entries(props).flatMap(([key, value]) => {
    const field = definition.configSchema.find((item) => item.key === key);
    return field ? validateField(componentType, key, field.type, value) : [`${componentType}.${key} is not configurable`];
  });
}

export function validateComponent(component: unknown, catalog: AgentComponentDefinition[]): string[] {
  if (!isRecord(component)) return ["component must be an object"];
  const errors: string[] = [];
  if (typeof component.id !== "string" || !component.id.trim()) errors.push("component.id must be a nonempty string");
  const definition = catalog.find((item) => item.type === component.type);
  if (!definition) return [...errors, `Unknown component type: ${String(component.type)}`];
  if (!isRecord(component.props)) return [...errors, `${definition.type}.props must be an object`];
  for (const key of Object.keys(definition.defaultProps)) {
    if (!Object.hasOwn(component.props, key)) errors.push(`${definition.type}.${key} is required`);
  }
  for (const [key, value] of Object.entries(component.props)) {
    const field = definition.configSchema.find((item) => item.key === key);
    if (field) errors.push(...validateField(definition.type, key, field.type, value));
    else if (!Object.hasOwn(definition.defaultProps, key)) errors.push(`${definition.type}.${key} is not a declared property`);
  }
  return errors;
}

export function validatePageSchema(page: unknown, catalog: AgentComponentDefinition[]): string[] {
  if (!isRecord(page)) return ["page must be an object"];
  const errors: string[] = [];
  if (page.schemaVersion !== 1) errors.push("page.schemaVersion must be 1");
  if (typeof page.id !== "string" || !page.id.trim()) errors.push("page.id must be a nonempty string");
  if (typeof page.title !== "string") errors.push("page.title must be a string");
  if (!Array.isArray(page.components)) return [...errors, "page.components must be an array"];
  const ids = new Set<string>();
  page.components.forEach((component, index) => {
    errors.push(...validateComponent(component, catalog).map((message) => `components[${index}]: ${message}`));
    if (isRecord(component) && typeof component.id === "string") {
      if (ids.has(component.id)) errors.push(`components[${index}]: Duplicate component id: ${component.id}`);
      ids.add(component.id);
    }
  });
  return errors;
}
