import type { AnyComponentDefinition } from "@mpp/component-core";

export class ComponentRegistry {
  private definitions = new Map<string, AnyComponentDefinition>();

  register(definition: AnyComponentDefinition): void {
    if (this.definitions.has(definition.type)) {
      throw new Error(`Component type already registered: ${definition.type}`);
    }

    this.definitions.set(definition.type, definition);
  }

  get(type: string): AnyComponentDefinition | undefined {
    return this.definitions.get(type);
  }

  getAll(): AnyComponentDefinition[] {
    return Array.from(this.definitions.values());
  }

  has(type: string): boolean {
    return this.definitions.has(type);
  }

  clear(): void {
    this.definitions.clear();
  }
}

export const componentRegistry = new ComponentRegistry();
