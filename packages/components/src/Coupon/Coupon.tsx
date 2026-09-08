import type { CouponProps } from "./types";

export function Coupon({ title, amount, threshold }: CouponProps) {
  return (
    <section className="mpp-coupon">
      <div>
        <strong>{title}</strong>
        <span>
          满 {threshold} 减 {amount}
        </span>
      </div>
    </section>
  );
}
