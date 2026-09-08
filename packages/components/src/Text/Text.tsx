import type { TextProps } from "./types";

export function Text({ content, color }: TextProps) {
  return (
    <section className="mpp-text" style={{ color }}>
      <p>{content}</p>
    </section>
  );
}
