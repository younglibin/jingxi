import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkBrowser } from "../src/components/work-browser";
import { request, login } from "../src/lib/api";
afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState({}, "", "/");
});
const cards = Array.from({ length: 25 }, (_, i) => ({
  publicKey: `p${i}`,
  slug: `work-${i}`,
  title: `作品${i + 1}`,
  summary: "",
  year: 2026,
  category: { slug: "brand", name: "品牌" },
  cover: { url: `/${i}.jpg`, width: 300, height: 400 },
}));
it("shows 12 then 24 then 25 items and resets to 12 when category changes", async () => {
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    return {
      ok: true,
      status: 200,
      json: async () =>
        input.includes("catalog")
          ? {
              orderedPublicKeys: cards.map((c) => c.publicKey),
              categories: [{ slug: "brand", name: "品牌" }],
              catalogRevision: 1,
            }
          : {
              items: cards.slice(0, body.take),
              total: 25,
              categoryCounts: { brand: 25 },
              hasMore: body.take < 25,
            },
    };
  });
  render(<WorkBrowser />);
  await waitFor(() =>
    expect(screen.getAllByRole("link", { name: /作品\d/ })).toHaveLength(12),
  );
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
  await waitFor(() =>
    expect(screen.getAllByRole("link", { name: /作品\d/ })).toHaveLength(24),
  );
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
  await waitFor(() =>
    expect(screen.getAllByRole("link", { name: /作品\d/ })).toHaveLength(25),
  );
  fireEvent.click(screen.getByRole("button", { name: /品牌/ }));
  await waitFor(() =>
    expect(screen.getAllByRole("link", { name: /作品\d/ })).toHaveLength(12),
  );
});
it("sends csrf on writes and reports version conflicts without erasing fields", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return url.endsWith("csrf")
      ? {
          ok: true,
          status: 200,
          json: async () => ({ token: "token-a", headerName: "X-CSRF-TOKEN" }),
        }
      : {
          ok: false,
          status: 409,
          json: async () => ({ code: "CONFLICT", message: "草稿版本已变化" }),
        };
  });
  await expect(
    request("/api/admin/v1/works/a/draft", {
      method: "PUT",
      body: JSON.stringify({
        expectedDraftRevision: 1,
        content: { title: "修改" },
      }),
    }),
  ).rejects.toThrow("草稿版本已变化");
  expect(new Headers(calls[1].init.headers).get("X-CSRF-TOKEN")).toBe(
    "token-a",
  );
});
it("uses form-urlencoded login and obtains a fresh csrf token afterwards", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith("csrf")
          ? { token: "abc", headerName: "X-CSRF-TOKEN" }
          : { authenticated: true, username: "editor" },
    };
  });
  await login("editor", "s & =");
  expect(calls.map((c) => c.url)).toEqual([
    "/api/auth/csrf",
    "/api/auth/login",
    "/api/auth/csrf",
  ]);
  expect(
    new URLSearchParams(calls[1].init.body as string).get("password"),
  ).toBe("s & =");
  expect(new Headers(calls[1].init.headers).get("Content-Type")).toBe(
    "application/x-www-form-urlencoded",
  );
});
it("retries the catalog request after an initial failure instead of converting the failure into an empty portfolio", async () => {
  let catalogCalls = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.includes("catalog")) {
      catalogCalls++;
      return catalogCalls === 1
        ? {
            ok: false,
            status: 503,
            json: async () => ({ message: "暂时不可用" }),
          }
        : {
            ok: true,
            status: 200,
            json: async () => ({
              orderedPublicKeys: cards.map((c) => c.publicKey),
              categories: [],
              catalogRevision: 1,
            }),
          };
    }
    const body = JSON.parse(init?.body as string);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: body.orderedPublicKeys.length ? cards.slice(0, 12) : [],
        total: 25,
        categoryCounts: {},
        hasMore: true,
      }),
    };
  });
  render(<WorkBrowser />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() =>
    expect(screen.getAllByRole("link", { name: /作品\d/ })).toHaveLength(12),
  );
});
it("keeps the all-category count independent of the selected category total", async () => {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    return {
      ok: true,
      status: 200,
      json: async () =>
        url.includes("catalog")
          ? {
              orderedPublicKeys: ["p1", "p2"],
              categories: [{ slug: "brand", name: "品牌" }],
              catalogRevision: 1,
            }
          : {
              items: [],
              total: body.categorySlug ? 6 : 12,
              categoryCounts: { brand: 6, other: 6 },
              hasMore: false,
            },
    };
  });
  render(<WorkBrowser />);
  await screen.findByRole("button", { name: "全部 12" });
  fireEvent.click(screen.getByRole("button", { name: "品牌 6" }));
  await waitFor(() =>
    expect(screen.queryByRole("status")).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "全部 12" })).toBeInTheDocument();
});
it("sends public browse JSON with an application/json content type without creating a session", async () => {
  const calls: { path: string; options: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (path: string, options: RequestInit = {}) => {
    calls.push({ path, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: [],
        total: 0,
        categoryCounts: {},
        hasMore: false,
      }),
    };
  });
  await request("/api/public/v1/works/browse", {
    method: "POST",
    body: JSON.stringify({ orderedPublicKeys: ["p-1"], take: 12 }),
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].path).toBe("/api/public/v1/works/browse");
  expect(new Headers(calls[0].options.headers).get("Content-Type")).toBe(
    "application/json",
  );
  expect(JSON.parse(calls[0].options.body as string)).toEqual({
    orderedPublicKeys: ["p-1"],
    take: 12,
  });
});
function catalogTransport() {
  let catalogs = 0;
  vi.stubGlobal("fetch", async (url: string, options: RequestInit = {}) => ({
    ok: true,
    status: 200,
    json: async () => {
      if (url.includes("catalog")) {
        catalogs++;
        return {
          orderedPublicKeys: [catalogs === 1 ? "fresh" : "newer"],
          categories: [{ slug: "brand", name: "品牌" }],
          catalogRevision: catalogs,
        };
      }
      const body = JSON.parse(options.body as string);
      return {
        items: body.orderedPublicKeys.map((key: string) => ({
          ...cards[0],
          publicKey: key,
          title: key,
        })),
        total: 1,
        hasMore: false,
        categoryCounts: { brand: 1 },
      };
    },
  }));
}
it("uses a fresh catalog on a normal mount even when a prior session snapshot exists", async () => {
  sessionStorage.setItem(
    "jingxi-work-browser-v1",
    JSON.stringify({ category: "", take: 24, scroll: 0, keys: ["stale"] }),
  );
  catalogTransport();
  render(<WorkBrowser />);
  await screen.findByRole("link", { name: "fresh" });
  expect(screen.queryByRole("link", { name: "stale" })).not.toBeInTheDocument();
});
it("refetches the catalog sequence when switching categories", async () => {
  catalogTransport();
  render(<WorkBrowser />);
  await screen.findByRole("link", { name: "fresh" });
  fireEvent.click(screen.getByRole("button", { name: "品牌 1" }));
  await screen.findByRole("link", { name: "newer" });
  expect(screen.queryByRole("link", { name: "fresh" })).not.toBeInTheDocument();
});
it("restores a snapshot only for a marked detail return and consumes that marker", async () => {
  sessionStorage.setItem(
    "jingxi-work-browser-v1",
    JSON.stringify({
      category: "",
      take: 24,
      scroll: 0,
      keys: ["saved-detail-order"],
    }),
  );
  sessionStorage.setItem("jingxi-work-browser-detail-return", "1");
  vi.stubGlobal("scrollTo", () => {});
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  catalogTransport();
  render(<WorkBrowser />);
  await screen.findByRole("link", { name: "saved-detail-order" });
  expect(
    sessionStorage.getItem("jingxi-work-browser-detail-return"),
  ).toBeNull();
});
it("marks an ordinary work-card navigation as a detail-return candidate", async () => {
  catalogTransport();
  const { container } = render(<WorkBrowser />);
  container.addEventListener("click", (event) => event.preventDefault());
  const card = await screen.findByRole("link", { name: "fresh" });
  fireEvent.click(card);
  expect(sessionStorage.getItem("jingxi-work-browser-detail-return")).toBe("1");
});
it("writes a selected category to the URL query so a refresh keeps the filter with a new sequence", async () => {
  catalogTransport();
  render(<WorkBrowser />);
  await screen.findByRole("link", { name: "fresh" });
  fireEvent.click(screen.getByRole("button", { name: "品牌 1" }));
  await screen.findByRole("link", { name: "newer" });
  expect(new URL(location.href).searchParams.get("category")).toBe("brand");
});
it("restores a matching category snapshot when the returning list URL includes that category", async () => {
  history.replaceState({}, "", "/works?category=brand");
  sessionStorage.setItem(
    "jingxi-work-browser-v1",
    JSON.stringify({
      category: "brand",
      take: 24,
      scroll: 0,
      keys: ["saved-category-order"],
    }),
  );
  sessionStorage.setItem("jingxi-work-browser-detail-return", "1");
  vi.stubGlobal("scrollTo", () => {});
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  catalogTransport();
  render(<WorkBrowser />);
  await screen.findByRole("link", { name: "saved-category-order" });
});
