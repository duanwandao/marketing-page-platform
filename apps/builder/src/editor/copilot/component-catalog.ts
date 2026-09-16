import type { ComponentRegistry } from "@mpp/component-registry";
import type { AgentComponentDefinition } from "@mpp/schema";

export function serializeComponentCatalog(registry: ComponentRegistry): AgentComponentDefinition[] {
  return registry.getAll().map(({ type, name, defaultProps, configSchema }) => ({
    type, name, defaultProps: structuredClone(defaultProps), configSchema: structuredClone(configSchema)
  }));
}
