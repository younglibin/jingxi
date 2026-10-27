import type { Card, Image } from "@/lib/types";
export function CoverImage({ image, alt }: { image: Image; alt: string }) {
  const crop = image.crop;
  if (crop && crop.width > 0 && crop.height > 0)
    return (
      <img
        src={image.url}
        alt={image.alt || alt}
        width={image.width}
        height={image.height}
        style={{
          position: "absolute",
          left: `${(-crop.x / crop.width) * 100}%`,
          top: `${(-crop.y / crop.height) * 100}%`,
          width: `${100 / crop.width}%`,
          height: `${100 / crop.height}%`,
          maxWidth: "none",
          objectFit: "fill",
        }}
      />
    );
  return (
    <img
      src={image.url}
      alt={image.alt || alt}
      width={image.width}
      height={image.height}
      style={{
        objectPosition: image.focal
          ? `${image.focal.x * 100}% ${image.focal.y * 100}%`
          : undefined,
      }}
    />
  );
}
export function WorkCard({ work }: { work: Card }) {
  return (
    <a
      className="work-card"
      href={`/works/${work.slug}`}
      aria-label={work.title}
    >
      <div className="cover">
        <CoverImage image={work.cover} alt={work.title} />
      </div>
      <div className="card-label">
        <span>{work.title}</span>
        <span aria-hidden>↗</span>
      </div>
      <p className="muted small">
        {work.category.name}
        {work.year ? ` / ${work.year}` : ""}
      </p>
    </a>
  );
}
export function PlaceholderCard({ number }: { number: number }) {
  return (
    <div className={`placeholder-card color-${(number - 1) % 6}`}>
      <span>作品封面 · 可替换</span>
      <strong>{String(number).padStart(2, "0")}</strong>
      <span>在这里放入你的作品</span>
    </div>
  );
}
