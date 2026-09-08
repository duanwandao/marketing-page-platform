import type { ComponentDefinition } from "@mpp/component-core";
import { Coupon } from "./Coupon";
import type { CouponProps } from "./types";

export const CouponDefinition: ComponentDefinition<CouponProps> = {
  type: "Coupon",
  name: "Coupon",
  component: Coupon,
  defaultProps: {
    title: "中秋专享券",
    amount: 20,
    threshold: 50
  },
  configSchema: [
    { key: "title", label: "Title", type: "text" },
    { key: "amount", label: "Amount", type: "number" },
    { key: "threshold", label: "Threshold", type: "number" }
  ]
};
