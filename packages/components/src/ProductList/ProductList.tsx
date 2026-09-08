import type { ProductListProps } from "./types";

export function ProductList({ title, products }: ProductListProps) {
  return (
    <section className="mpp-products">
      <h2>{title}</h2>
      <div className="mpp-products__grid">
        {products.map((product) => (
          <article className="mpp-product" key={product.id}>
            <span>{product.name}</span>
            <strong>¥{product.price}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
