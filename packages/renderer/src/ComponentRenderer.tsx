import type { ComponentSchema } from "@mpp/schema";
import { componentRegistry } from "@mpp/component-registry";
import { UnknownComponent } from "./UnknownComponent";

export interface ComponentRendererProps {
  component: ComponentSchema;
}

export function ComponentRenderer({ component }: ComponentRendererProps) {
  const definition = componentRegistry.get(component.type);

  if (!definition) {
    return <UnknownComponent type={component.type} />;
  }

  const Component = definition.component;
  return <Component {...component.props} />;
}
