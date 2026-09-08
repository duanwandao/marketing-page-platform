import type React from "react";
import type { ConfigField } from "./config-field";

export interface ComponentDefinition<
  TProps extends Record<string, unknown> = Record<string, unknown>
> {
  type: string;
  name: string;
  component: React.ComponentType<TProps>;
  defaultProps: TProps;
  configSchema: ConfigField[];
}

export type AnyComponentDefinition = ComponentDefinition<any>;
