export interface ProductItem {
  id: string;
  name: string;
  price: number;
}

export interface ProductListProps extends Record<string, unknown> {
  title: string;
  products: ProductItem[];
}
