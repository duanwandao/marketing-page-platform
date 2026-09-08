import { componentRegistry } from "@mpp/component-registry";
import { BannerDefinition } from "./Banner";
import { CouponDefinition } from "./Coupon";
import { ProductListDefinition } from "./ProductList";
import { TextDefinition } from "./Text";

export function registerBuiltinComponents() {
  for (const definition of [BannerDefinition, TextDefinition, CouponDefinition, ProductListDefinition]) {
    if (!componentRegistry.has(definition.type)) {
      componentRegistry.register(definition);
    }
  }
}
