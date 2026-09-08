import type { BannerProps } from "./types";

export function Banner({ title, image, backgroundColor }: BannerProps) {
  return (
    <section className="mpp-banner" style={{ backgroundColor }}>
      {image ? <img className="mpp-banner__image" src={image} alt="" /> : null}
      <h1>{title}</h1>
    </section>
  );
}
