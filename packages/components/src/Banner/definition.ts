import type { ComponentDefinition } from "@mpp/component-core";
import { Banner } from "./Banner";
import type { BannerProps } from "./types";

export const BannerDefinition: ComponentDefinition<BannerProps> = {
  type: "Banner",
  name: "Banner",
  component: Banner,
  defaultProps: {
    title: "中秋团圆饭",
    image: "",
    backgroundColor: "#fff4d6"
  },
  configSchema: [
    { key: "title", label: "Title", type: "text" },
    { key: "image", label: "Image URL", type: "image" },
    { key: "backgroundColor", label: "Background", type: "color" }
  ]
};
