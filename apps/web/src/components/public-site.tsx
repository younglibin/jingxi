"use client";
import { useEffect, useRef, useState } from "react";
import type { PublicSite, Detail, Card } from "@/lib/types";
import { decorationIcons } from "@/lib/icons";
import { WorkCard, PlaceholderCard } from "./cards";
import { Lightbox } from "./lightbox";
export function SiteHeader({ site }: { site: PublicSite }) {
  const [open, setOpen] = useState(false),
    trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("jingxi-lightbox", close);
    return () => window.removeEventListener("jingxi-lightbox", close);
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menu.current?.querySelector("a")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
      if (e.key === "Tab") {
        const links = menu.current?.querySelectorAll<HTMLElement>("a,button");
        if (!links?.length) return;
        const first = links[0],
          last = links[links.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", key);
      trigger.current?.focus();
    };
  }, [open]);
  return (
    <header className="site-header container">
      <a href="/" className="wordmark">
        {site.brand.logoUrl ? (
          <img src={site.brand.logoUrl} alt={site.brand.name} />
        ) : (
          site.brand.name
        )}
      </a>
      <nav aria-label="主导航">
        <a href="/works">作品</a>
        <a href="/about">关于</a>
        <a href="/about#contact">联系</a>
      </nav>
      <button
        ref={trigger}
        className="menu-trigger"
        aria-label="打开菜单"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        菜单 <span>☰</span>
      </button>
      {open && (
        <div
          ref={menu}
          className="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="导航菜单"
        >
          <button onClick={() => setOpen(false)}>关闭 ×</button>
          <a href="/works">作品</a>
          <a href="/about">关于</a>
          <a href="/about#contact">联系</a>
        </div>
      )}
    </header>
  );
}
export function SiteFooter({ site }: { site: PublicSite }) {
  return (
    <footer className="site-footer container">
      <a className="wordmark" href="/">
        {site.brand.name}
      </a>
      <p className="muted small">{site.brand.tagline}</p>
      <p className="muted small">
        © {new Date().getFullYear()} {site.brand.name}
      </p>
    </footer>
  );
}
function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            observer.unobserve(e.target);
          }
        }),
      { threshold: 0.12 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}
export function Gallery({ works }: { works: Card[] }) {
  const [paused, setPaused] = useState(false),
    [inView, setInView] = useState(false),
    [visible, setVisible] = useState(true),
    track = useRef<HTMLDivElement>(null),
    drag = useRef({ x: 0, left: 0, moved: false, active: false });
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => setInView(entries.some((e) => e.isIntersecting)),
            { threshold: 0.05 },
          )
        : null;
    if (track.current) observer?.observe(track.current);
    if (!observer) setInView(true);
    return () => {
      document.removeEventListener("visibilitychange", update);
      observer?.disconnect();
    };
  }, []);
  useEffect(() => {
    const el = track.current;
    if (
      !el ||
      paused ||
      !inView ||
      !visible ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia?.("(max-width: 767px)").matches
    )
      return;
    let frame: number,
      last = 0;
    const tick = (time: number) => {
      if (last) {
        el.scrollLeft += (time - last) * 0.025;
        if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 1)
          el.scrollLeft = 0;
      }
      last = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused, inView, visible]);
  return (
    <section className="section gallery-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">06 / 作品画廊</p>
          <h2>
            每一种表达，
            <br />
            都有自己的位置。
          </h2>
        </div>
        <button
          className="button secondary"
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
        >
          {paused ? "继续播放" : "暂停画廊"}
        </button>
      </div>
      <div
        ref={track}
        className="gallery-track"
        tabIndex={0}
        aria-label="横向作品画廊，可左右滑动"
        onMouseEnter={() => setPaused(true)}
        onFocus={() => setPaused(true)}
        onPointerDown={(e) => {
          if (e.pointerType === "touch") return;
          drag.current = {
            x: e.clientX,
            left: track.current!.scrollLeft,
            moved: false,
            active: true,
          };
          setPaused(true);
        }}
        onPointerMove={(e) => {
          if (!drag.current.active) return;
          const dx = e.clientX - drag.current.x;
          if (Math.abs(dx) > 5) drag.current.moved = true;
          track.current!.scrollLeft = drag.current.left - dx;
        }}
        onPointerUp={() => (drag.current.active = false)}
        onPointerLeave={() => (drag.current.active = false)}
        onClickCapture={(e) => {
          if (drag.current.moved) {
            e.preventDefault();
            drag.current.moved = false;
          }
        }}
      >
        {works.map((w) => (
          <WorkCard key={w.publicKey} work={w} />
        ))}
      </div>
      <p className="muted small">拖动或滑动浏览作品</p>
    </section>
  );
}
export function Home({ site }: { site: PublicSite }) {
  const h = site.homepage,
    [tab, setTab] = useState(0);
  const selected = h.categories.items[tab];
  if (site.loadError) return <SiteLoadFailure />;
  return (
    <main className="home container">
      <section className="hero">
        <p className="eyebrow">{h.hero.description || site.brand.tagline}</p>
        <h1>{h.hero.title || "为你的作品，\n留一个好位置。"}</h1>
        <div className={`hero-fan ${h.hero.works.length ? "has-works" : ""}`}>
          {h.hero.works.length
            ? h.hero.works.slice(0, 8).map((w, i) => (
                <div
                  className="fan-item"
                  style={
                    {
                      "--i": i,
                      "--count": Math.min(8, h.hero.works.length),
                    } as React.CSSProperties
                  }
                  key={w.publicKey}
                >
                  <WorkCard work={w} />
                </div>
              ))
            : Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className="fan-item"
                  style={{ "--i": i, "--count": 6 } as React.CSSProperties}
                >
                  <PlaceholderCard number={i + 1} />
                </div>
              ))}
        </div>
        <div className="hero-actions">
          <a className="button" href="/works" aria-label="浏览作品">
            浏览作品 <span>↗</span>
          </a>
          <a className="button secondary" href="/about">
            关于我们
          </a>
        </div>
        <p className="muted small">
          {h.hero.works.length
            ? "向下看看我们的作品"
            : "封面为可替换占位，请在后台添加并发布真实作品。"}
        </p>
      </section>
      <section className="section featured">
        <Reveal>
          <div className="section-heading">
            <div>
              <p className="eyebrow">02 / 精选作品</p>
              <h2>{h.featured.title || "让好作品，\n被看见。"}</h2>
              <p className="muted">{h.featured.description}</p>
              <a className="text-link" href="/works">
                所有作品 ↗
              </a>
            </div>
            {h.featured.works.length > 0 && (
              <div className="featured-grid">
                {h.featured.works.slice(0, 5).map((w) => (
                  <WorkCard key={w.publicKey} work={w} />
                ))}
              </div>
            )}
          </div>
          {!h.featured.works.length && (
            <p className="empty muted">作品正在准备中，敬请期待。</p>
          )}
        </Reveal>
      </section>
      {h.banner.enabled && h.banner.image && (
        <section className="section banner">
          <Reveal>
            <div
              className="banner-frame"
              style={
                {
                  "--desktop-focal": `${h.banner.desktopFocal.x * 100}% ${h.banner.desktopFocal.y * 100}%`,
                  "--mobile-focal": `${h.banner.mobileFocal.x * 100}% ${h.banner.mobileFocal.y * 100}%`,
                } as React.CSSProperties
              }
            >
              {h.banner.linkedWorkSlug ? (
                <a href={`/works/${h.banner.linkedWorkSlug}`}>
                  <img
                    src={h.banner.image.url}
                    alt={h.banner.image.alt || "品牌主视觉"}
                  />
                </a>
              ) : (
                <img
                  src={h.banner.image.url}
                  alt={h.banner.image.alt || "品牌主视觉"}
                />
              )}
            </div>
            <div className="partner-logos">
              {h.banner.logos.map(
                (logo, i) =>
                  logo.image &&
                  (logo.url ? (
                    <a
                      key={i}
                      href={logo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        src={logo.image.url}
                        alt={logo.image.alt || "合作品牌"}
                      />
                    </a>
                  ) : (
                    <img
                      key={i}
                      src={logo.image.url}
                      alt={logo.image.alt || "合作品牌"}
                    />
                  )),
              )}
            </div>
          </Reveal>
        </section>
      )}
      {h.statement.enabled && h.statement.text && (
        <section className="section statement">
          <Reveal>
            <p className="eyebrow">04 / 品牌主张</p>
            <h2 className="statement-text">
              {h.statement.text.split(/(?<=[。！？])/).map((line, i) => (
                <span key={i} style={{ transitionDelay: `${i * 150}ms` }}>
                  {line}
                </span>
              ))}
            </h2>
            <div className="statement-works">
              {h.statement.works.map((w) => (
                <WorkCard key={w.publicKey} work={w} />
              ))}
            </div>
          </Reveal>
        </section>
      )}
      {h.categories.enabled && h.categories.items.length > 0 && (
        <section className="section categories-section">
          <p className="eyebrow">05 / 作品分类</p>
          <h2>不同方向，同样用心。</h2>
          <div className="filter-row">
            {h.categories.items.map((c, i) => (
              <button
                key={c.slug}
                className={tab === i ? "active" : ""}
                onClick={() => setTab(i)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="category-panel">
            <div className="category-cards">
              {selected?.works.slice(0, 4).map((w) => (
                <WorkCard key={w.publicKey} work={w} />
              ))}
            </div>
            <a className="text-link" href={`/works?category=${selected?.slug}`}>
              查看{selected?.name}全部作品 ↗
            </a>
          </div>
        </section>
      )}
      {h.gallery.enabled && h.gallery.works.length > 0 && (
        <Gallery works={h.gallery.works} />
      )}
      {h.cases.enabled && h.cases.items.length > 0 && (
        <section className="section">
          <p className="eyebrow">07 / 案例故事</p>
          <h2>不止是一张好看的图。</h2>
          <div className="work-grid">
            {h.cases.items.map(({ work, summaryOverride }) => (
              <div key={work.publicKey}>
                <WorkCard work={work} />
                <p className="muted">{summaryOverride || work.summary}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {h.capabilities.enabled && h.capabilities.items.length > 0 && (
        <section className="section">
          <p className="eyebrow">08 / 能力介绍</p>
          <h2>我们可以一起做什么。</h2>
          <div className="capability-cards">
            {h.capabilities.items.map((c, i) => (
              <Reveal key={i}>
                <h3>{c.title}</h3>
                <p className="muted">{c.description}</p>
              </Reveal>
            ))}
          </div>
        </section>
      )}
      <section className="closing section">
        <p className="eyebrow">09 / 开启合作</p>
        <h2>{h.closing.title || "下一个好作品，\n一起创造。"}</h2>
        <a className="button" href="/about#contact">
          联系聊聊 ↗
        </a>
        {h.closing.showDecoration && (
          <span className="closing-decoration" aria-hidden>
            {(h.closing.iconKeys.length ? h.closing.iconKeys : ["star"]).map(
              (key, i) => (
                <span
                  key={`${key}-${i}`}
                  style={{ transform: `rotate(${i * 18 - 12}deg)` }}
                >
                  {decorationIcons.find((icon) => icon.key === key)?.glyph}
                </span>
              ),
            )}
          </span>
        )}
      </section>
    </main>
  );
}
export function WorkDetail({ work }: { work: Detail }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const images = work.blocks
    .filter((b) => b.type === "image" && b.image)
    .map((b) => ({
      ...b.image!,
      alt: b.alt || b.image?.alt || work.title,
      caption: b.caption,
    }));
  const show = (id: string) => {
    window.dispatchEvent(new Event("jingxi-lightbox"));
    setLightbox(
      work.blocks
        .filter((b) => b.type === "image" && b.image)
        .findIndex((b) => b.id === id),
    );
  };
  const renderImage = (block: Detail["blocks"][number]) =>
    block.image && (
      <figure key={block.id}>
        <button
          className="image-open"
          aria-label={`放大 ${block.alt || block.image.alt || work.title}`}
          onClick={() => show(block.id)}
        >
          <img
            src={block.image.url}
            width={block.image.width}
            height={block.image.height}
            alt={block.alt || block.image.alt || work.title}
          />
        </button>
        {block.caption && (
          <figcaption className="muted">{block.caption}</figcaption>
        )}
      </figure>
    );
  return (
    <main className="container detail">
      <div className="detail-intro">
        <p className="eyebrow">
          {work.category.name} / {work.year || ""}
        </p>
        <h1>{work.title}</h1>
        {work.summary && <p className="muted">{work.summary}</p>}
        <dl className="detail-meta">
          {work.client && (
            <div>
              <dt>客户</dt>
              <dd>{work.client}</dd>
            </div>
          )}
          {work.role && (
            <div>
              <dt>职责</dt>
              <dd>{work.role}</dd>
            </div>
          )}
          {work.year && (
            <div>
              <dt>年份</dt>
              <dd>{work.year}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="detail-content">
        {work.blocks.map((b) =>
          b.type === "image"
            ? renderImage(b)
            : b.text && (
                <p key={b.id} className="body-text">
                  {b.text}
                </p>
              ),
        )}
      </div>
      {work.relatedWorks.length > 0 && (
        <section className="section">
          <p className="eyebrow">继续看看</p>
          <h2>看看其他作品。</h2>
          <div className="work-grid">
            {work.relatedWorks.map((w) => (
              <WorkCard key={w.publicKey} work={w} />
            ))}
          </div>
        </section>
      )}
      <a className="button" href="/works">
        所有作品
      </a>
      {lightbox !== null && (
        <Lightbox
          images={images}
          index={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </main>
  );
}
export function About({ site }: { site: PublicSite }) {
  const [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState("");
  if (site.loadError) return <SiteLoadFailure />;
  return (
    <main>
      <section className="container about-intro">
        <p className="eyebrow">关于 / 品牌与合作</p>
        <h1>
          用作品，
          <br />
          认真表达。
        </h1>
        {site.about.description && (
          <p className="about-description muted">{site.about.description}</p>
        )}
        {site.about.mainImage && (
          <img
            className="about-main"
            src={site.about.mainImage.url}
            alt={site.about.mainImage.alt || "品牌与团队"}
          />
        )}
        <div className="team-grid">
          {site.about.teamImages.map((item, i) => (
            <figure key={i}>
              {item.image ? (
                <img
                  src={item.image.url}
                  alt={item.image.alt || item.caption || ""}
                />
              ) : item.url ? (
                <img src={item.url} alt={item.caption || ""} />
              ) : null}
              <figcaption>{item.caption}</figcaption>
            </figure>
          ))}
        </div>
        <div className="capability-list">
          {site.homepage.capabilities.items.map((c, i) => (
            <div key={i}>
              <span>0{i + 1}</span>
              <h2>{c.title}</h2>
              <p className="muted">{c.description}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="contact" id="contact">
        <div className="container">
          <p className="eyebrow">开始一段新的合作</p>
          <h2>聊聊你的想法。</h2>
          {site.contact.email ? (
            <>
              <p>{site.contact.email}</p>
              <div className="actions">
                <button
                  className="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(site.contact.email);
                      setCopied(true);
                      setCopyError("");
                    } catch {
                      setCopyError("复制失败，请选中上方邮箱复制。");
                    }
                  }}
                >
                  {copied ? "已复制邮箱" : "复制邮箱"}
                </button>
                <a
                  className="button secondary"
                  href={`mailto:${site.contact.email}`}
                >
                  打开邮箱
                </a>
              </div>
              {copyError && <p role="status">{copyError}</p>}
            </>
          ) : (
            <p>联系信息即将更新。</p>
          )}
          {site.contact.address && <p>{site.contact.address}</p>}
          <div className="social-links">
            {site.contact.links.map((l) => (
              <a
                href={l.url}
                key={l.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {l.label} ↗
              </a>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export function SiteLoadFailure({
  retryHref = "/",
}: { retryHref?: string } = {}) {
  return (
    <main className="container empty">
      <p className="error" role="alert">
        站点内容暂时无法加载，请稍后重试。
      </p>
      <a className="button" href={retryHref}>
        重新加载
      </a>
    </main>
  );
}
