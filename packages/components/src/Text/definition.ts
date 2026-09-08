import type { ComponentDefinition } from "@mpp/component-core";
import { Text } from "./Text";
import type { TextProps } from "./types";

export const TextDefinition: ComponentDefinition<TextProps> = {
  type: "Text",
  name: "Text",
  component: Text,
  defaultProps: {
    content: "限时优惠，欢迎选购。",
    color: "#263238"
  },
  configSchema: [
    { key: "content", label: "Content", type: "text" },
    { key: "color", label: "Color", type: "color" }
  ]
};
