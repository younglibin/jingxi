"use client";
import { useEffect, useRef, useState } from "react";
export type LightImage = { url: string; alt?: string; caption?: string };
export function Lightbox({
  images,
  index,
  onClose,
}: {
  images: LightImage[];
  index: number;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(index),
    box = useRef<HTMLDivElement>(null),
    start = useRef(0);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setCurrent((n) => Math.max(0, n - 1));
      if (e.key === "ArrowRight")
        setCurrent((n) => Math.min(images.length - 1, n + 1));
      if (e.key === "Tab") {
        const els = box.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [images.length, onClose]);
  const item = images[current];
  return (
    <div
      ref={box}
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="作品图片放大"
      tabIndex={-1}
      onTouchStart={(e) => (start.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - start.current;
        if (Math.abs(dx) > 50)
          setCurrent((n) =>
            Math.max(0, Math.min(images.length - 1, n + (dx < 0 ? 1 : -1))),
          );
      }}
    >
      <button className="lightbox-close" onClick={onClose}>
        关闭 ×
      </button>
      <img src={item.url} alt={item.alt || ""} />
      <div className="lightbox-tools">
        <button
          disabled={current === 0}
          onClick={() => setCurrent(current - 1)}
          aria-label="上一张"
        >
          ←
        </button>
        <span>
          {current + 1} / {images.length}
        </span>
        <button
          disabled={current === images.length - 1}
          onClick={() => setCurrent(current + 1)}
          aria-label="下一张"
        >
          →
        </button>
      </div>
      {item.caption && <p>{item.caption}</p>}
    </div>
  );
}
