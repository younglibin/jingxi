"use client";
import { useEffect, useRef, useState } from "react";
import { request, errorMessage } from "@/lib/api";
import type { Browse } from "@/lib/types";
import { restoreBrowse } from "@/lib/editor";
import { WorkCard } from "./cards";
const storageKey = "jingxi-work-browser-v1";
const detailReturnKey = "jingxi-work-browser-detail-return";
export function WorkBrowser() {
  const [keys, setKeys] = useState<string[] | null>(null),
    [categories, setCategories] = useState<{ slug: string; name: string }[]>(
      [],
    ),
    [category, setCategory] = useState(""),
    [take, setTake] = useState(12),
    [data, setData] = useState<Browse | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [catalogAttempt, setCatalogAttempt] = useState(0),
    scrollTarget = useRef<number | null>(null),
    sequence = useRef(0),
    configured = useRef(false),
    restoreCandidate = useRef<ReturnType<typeof restoreBrowse>>(null);
  useEffect(() => {
    let active = true;
    setError("");
    setLoading(true);
    if (!configured.current) {
      configured.current = true;
      const isDetailReturn = sessionStorage.getItem(detailReturnKey) === "1";
      sessionStorage.removeItem(detailReturnKey);
      const queryCategory = new URLSearchParams(location.search).get(
        "category",
      );
      const candidate = isDetailReturn
        ? restoreBrowse(sessionStorage.getItem(storageKey))
        : null;
      const saved =
        candidate && (!queryCategory || queryCategory === candidate.category)
          ? candidate
          : null;
      restoreCandidate.current = saved;
      if (saved) {
        setTake(saved.take);
        setCategory(saved.category);
        scrollTarget.current = saved.scroll;
      } else if (queryCategory) setCategory(queryCategory);
    }
    const saved = restoreCandidate.current;
    request<{
      orderedPublicKeys: string[];
      categories: { slug: string; name: string }[];
    }>("/api/public/v1/works/catalog")
      .then((c) => {
        if (active) {
          setCategories(c.categories);
          setKeys(saved ? saved.keys : c.orderedPublicKeys);
          restoreCandidate.current = null;
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorMessage(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [catalogAttempt]);
  useEffect(() => {
    if (!keys) return;
    const id = ++sequence.current;
    setLoading(true);
    setError("");
    request<Browse>("/api/public/v1/works/browse", {
      method: "POST",
      body: JSON.stringify({
        orderedPublicKeys: keys,
        categorySlug: category || undefined,
        take,
      }),
    })
      .then((result) => {
        if (id === sequence.current) {
          setData(result);
          if (scrollTarget.current !== null) {
            const y = scrollTarget.current;
            scrollTarget.current = null;
            requestAnimationFrame(() => window.scrollTo(0, y));
          }
        }
      })
      .catch((e) => {
        if (id === sequence.current) setError(errorMessage(e));
      })
      .finally(() => {
        if (id === sequence.current) setLoading(false);
      });
  }, [keys, category, take]);
  useEffect(() => {
    if (!keys) return;
    const save = () =>
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ category, take, keys, scroll: window.scrollY }),
      );
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    save();
    return () => {
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", save);
    };
  }, [keys, category, take]);
  const chooseCategory = (slug: string) => {
    sequence.current++;
    restoreCandidate.current = null;
    scrollTarget.current = null;
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set("category", slug);
    else url.searchParams.delete("category");
    window.history.replaceState(window.history.state, "", url);
    setCategory(slug);
    setTake(12);
    setData(null);
    setKeys(null);
    setCatalogAttempt((n) => n + 1);
  };
  return (
    <>
      <div className="filter-row" role="group" aria-label="作品分类">
        <button
          className={!category ? "active" : ""}
          onClick={() => chooseCategory("")}
        >
          全部{" "}
          {data
            ? Object.values(data.categoryCounts).reduce(
                (sum, count) => sum + count,
                0,
              )
            : ""}
        </button>
        {categories.map((c) => (
          <button
            key={c.slug}
            className={category === c.slug ? "active" : ""}
            onClick={() => chooseCategory(c.slug)}
          >
            {c.name} {data?.categoryCounts[c.slug] ?? ""}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
          <button
            onClick={() =>
              keys ? setKeys([...keys]) : setCatalogAttempt((n) => n + 1)
            }
          >
            重试
          </button>
        </p>
      )}
      <div
        aria-busy={loading}
        className="work-grid"
        onClickCapture={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          const anchor = (
            event.target as HTMLElement
          ).closest<HTMLAnchorElement>("a");
          if (anchor?.getAttribute("href")?.startsWith("/works/") && keys) {
            sessionStorage.setItem(
              storageKey,
              JSON.stringify({ category, take, keys, scroll: window.scrollY }),
            );
            sessionStorage.setItem(detailReturnKey, "1");
          }
        }}
      >
        {data?.items.map((w) => (
          <WorkCard key={w.publicKey} work={w} />
        ))}
      </div>
      {loading && <p role="status">正在加载作品…</p>}
      {!loading && data?.items.length === 0 && (
        <div className="empty">
          <h2>这里还没有作品。</h2>
          <p className="muted">试试其他分类，或稍后再来看看。</p>
        </div>
      )}
      {data?.hasMore && (
        <div className="center">
          <button
            disabled={loading}
            className="button"
            onClick={() => setTake((n) => n + 12)}
          >
            加载更多
          </button>
        </div>
      )}
    </>
  );
}
