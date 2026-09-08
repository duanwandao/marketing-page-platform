import type { ComponentDefinition } from "@mpp/component-core";
import { ProductList } from "./ProductList";
import type { ProductListProps } from "./types";

export const ProductListDefinition: ComponentDefinition<ProductListProps> = {
  type: "ProductList",
  name: "Product List",
  component: ProductList,
  defaultProps: {
    title: "热门套餐",
    products: [
      { id: "product-1", name: "团圆烤鸭套餐", price: 88 },
      { id: "product-2", name: "桂花酒酿小圆子", price: 28 },
      { id: "product-3", name: "月饼礼盒", price: 66 }
    ]
  },
  configSchema: [{ key: "title", label: "Title", type: "text" }]
};
