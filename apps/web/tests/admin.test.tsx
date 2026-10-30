import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { WorkEditor } from "../src/components/work-editor";
import { SettingsEditor } from "../src/components/settings-editor";
import type { Work } from "../src/lib/types";
afterEach(() => vi.unstubAllGlobals());
export const work: Work = {
  id: "w1",
  publicKey: "p1",
  lockedSlug: null,
  draftRevision: 1,
  stateRevision: 1,
  draft: {
    content: {
      title: "作品甲",
      slug: "work-one",
      categoryId: "other",
      summary: "",
      client: "",
      year: 2026,
      role: "",
      coverImageId: null,
      coverCrop: null,
      coverFocal: null,
      blocks: [],
      relatedWorkIds: [],
    },
  },
  published: null,
  visible: false,
  sortOrder: null,
  recycledAt: null,
  lastPublishedAt: null,
  createdAt: "",
  updatedAt: "",
};
it("edits actual work fields, adds a text block and preserves them on a save conflict", async () => {
  vi.stubGlobal("fetch", async (url: string) =>
    url.endsWith("csrf")
      ? {
          ok: true,
          json: async () => ({ token: "t", headerName: "X-CSRF-TOKEN" }),
        }
      : { ok: false, status: 409, json: async () => ({ message: "版本冲突" }) },
  );
  render(<WorkEditor initial={work} categories={[]} />);
  fireEvent.change(screen.getByRole("textbox", { name: "作品标题 *" }), {
    target: { value: "新作品标题" },
  });
  fireEvent.click(screen.getByRole("button", { name: "添加文字块" }));
  fireEvent.change(screen.getByRole("textbox", { name: "文字内容 1" }), {
    target: { value: "正文内容" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("版本冲突"),
  );
  expect(screen.getByRole("textbox", { name: "作品标题 *" })).toHaveValue(
    "新作品标题",
  );
  expect(screen.getByRole("textbox", { name: "文字内容 1" })).toHaveValue(
    "正文内容",
  );
});
it("offers dedicated controls for all nine homepage modules and brand contact instead of one JSON field", () => {
  const h = {
    hero: { enabled: true, title: "首屏", description: "", workIds: [] },
    featured: { enabled: true, title: "精选", description: "", workIds: [] },
    banner: {
      enabled: true,
      assetId: null,
      desktopFocal: { x: 0.5, y: 0.5 },
      mobileFocal: { x: 0.5, y: 0.5 },
      logos: [],
    },
    statement: { enabled: true, text: "", decorationWorkIds: [] },
    categories: { enabled: true, categoryIds: [] },
    gallery: { enabled: true, workIds: [] },
    cases: { enabled: true, items: [] },
    capabilities: { enabled: true, items: [] },
    closing: {
      enabled: true,
      title: "联系",
      showDecoration: true,
      iconKeys: [],
    },
  };
  render(
    <SettingsEditor
      initial={{
        draftRevision: 1,
        stateRevision: 1,
        draft: {
          content: {
            brand: { name: "工作室", tagline: "", logoAssetId: null },
            about: { description: "", mainAssetId: null, teamImages: [] },
            contact: { email: "", address: "", links: [] },
            homepage: h,
          },
        },
        published: null,
      }}
      works={[]}
      categories={[]}
    />,
  );
  expect(screen.getByRole("textbox", { name: "品牌名称 *" })).toHaveValue(
    "工作室",
  );
  fireEvent.click(screen.getByRole("tab", { name: "联系方式" }));
  expect(screen.getByRole("textbox", { name: "公开邮箱" })).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "首页模块" }));
  expect(screen.getByText("H01 首屏作品展开")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "联系收尾" }));
  expect(screen.getByText("H09 联系收尾")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "服务能力" }));
  fireEvent.click(screen.getByRole("button", { name: "添加能力" }));
  expect(
    screen.getByRole("textbox", { name: "能力标题 1" }),
  ).toBeInTheDocument();
});
it("allows cover crop zoom while keeping its rectangle centered and its aspect ratio", async () => {
  const w = {
    ...work,
    draft: {
      content: {
        ...work.draft.content,
        coverImageId: "image1",
        coverCrop: { x: 0.3125, y: 0, width: 0.375, height: 1 },
        coverFocal: { x: 0.5, y: 0.5 },
        blocks: [
          {
            id: "image1",
            type: "image" as const,
            sortOrder: 1,
            assetId: "asset1",
            alt: "作品主图",
          },
        ],
      },
    },
  };
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    json: async () => ({ items: [] }),
  }));
  render(
    <WorkEditor
      initial={w}
      categories={[]}
      assets={[
        {
          id: "asset1",
          width: 1600,
          height: 800,
          originalName: "cover.png",
          previewUrl: "/cover.png",
          displayImages: [],
        },
      ]}
    />,
  );
  fireEvent.change(screen.getByLabelText("封面缩放（1–3）"), {
    target: { value: "2" },
  });
  const preview = screen.getByRole("img", {
    name: "封面预览",
  }) as HTMLImageElement;
  expect(parseFloat(preview.style.width)).toBeCloseTo(533.3333);
  expect(parseFloat(preview.style.height)).toBeCloseTo(200);
  await waitFor(() =>
    expect(
      screen.getByRole("option", { name: "选择公开作品" }),
    ).toBeInTheDocument(),
  );
});
it("makes public works beyond the first management page available as related works", async () => {
  const projects = Array.from({ length: 21 }, (_, i) => ({
    ...work,
    id: `w${i + 2}`,
    visible: true,
    draft: { content: { ...work.draft.content, title: `关联作品${i + 1}` } },
  }));
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: true,
    json: async () => ({
      items: url.includes("page=2")
        ? projects.slice(20)
        : projects.slice(0, 20),
      total: 21,
      pageSize: 20,
    }),
  }));
  render(<WorkEditor initial={work} categories={[]} />);
  await waitFor(() =>
    expect(
      screen.getByRole("option", { name: "关联作品21" }),
    ).toBeInTheDocument(),
  );
});
it("offers a direct saved-revision preview link even when the browser blocks a new window", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.endsWith("csrf")
        ? { token: "t", headerName: "X-CSRF-TOKEN" }
        : url.includes("/draft")
          ? { ...work, draftRevision: 2, stateRevision: 2 }
          : { items: [], total: 0 },
  }));
  render(<WorkEditor initial={work} categories={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "保存并预览" }));
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "打开已保存预览 ↗" }),
    ).toHaveAttribute("href", "/admin/preview/works/w1?revision=2"),
  );
  vi.restoreAllMocks();
});
it("selects a supported closing icon with a friendly control and saves that key", async () => {
  const { defaultSite } = await import("../src/lib/default-site");
  const config = {
    draftRevision: 1,
    stateRevision: 1,
    draft: { content: structuredClone(defaultSite) },
    published: null,
  };
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => ({
    ok: true,
    status: 200,
    json: async () => {
      if (url.endsWith("csrf"))
        return { token: "t", headerName: "X-CSRF-TOKEN" };
      const payload = JSON.parse(init.body as string);
      if (!payload.content.homepage.closing.iconKeys.includes("circle"))
        throw Error("圆形图标未保存");
      return {
        ...config,
        draftRevision: 2,
        draft: { content: payload.content },
      };
    },
  }));
  render(<SettingsEditor initial={config} works={[]} categories={[]} />);
  fireEvent.click(screen.getByRole("tab", { name: "首页模块" }));
  fireEvent.click(screen.getByRole("tab", { name: "联系收尾" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "圆形" }));
  fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("已保存"),
  );
  expect(screen.getByRole("checkbox", { name: "圆形" })).toBeChecked();
});
it("explains a summary validation failure while preserving the entered text", async () => {
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    json: async () => ({ items: [], total: 0 }),
  }));
  render(<WorkEditor initial={work} categories={[]} />);
  const summary = "字".repeat(201);
  fireEvent.change(screen.getByRole("textbox", { name: "项目摘要" }), {
    target: { value: summary },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  await screen.findByText("简介最多200字");
  expect(screen.getByRole("textbox", { name: "项目摘要" })).toHaveValue(
    summary,
  );
});
it("disables work fields throughout a pending save so a response cannot overwrite newer edits", async () => {
  let resolveSave: (response: unknown) => void = () => {};
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.endsWith("csrf"))
      return {
        ok: true,
        json: async () => ({ token: "t", headerName: "X-CSRF-TOKEN" }),
      };
    if (url.includes("/draft"))
      return new Promise((resolve) => {
        resolveSave = resolve;
      });
    return { ok: true, json: async () => ({ items: [], total: 0 }) };
  });
  render(<WorkEditor initial={work} categories={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  expect(screen.getByRole("textbox", { name: "作品标题 *" })).toBeDisabled();
  await act(async () => {});
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled(),
  );
  await act(async () =>
    resolveSave({
      ok: true,
      json: async () => ({ ...work, draftRevision: 2 }),
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "作品标题 *" })).toBeEnabled(),
  );
});
it("disables website setting fields until a pending save is settled", async () => {
  const { defaultSite } = await import("../src/lib/default-site");
  const config = {
    draftRevision: 1,
    stateRevision: 1,
    draft: { content: structuredClone(defaultSite) },
    published: null,
  };
  let resolveSave: (response: unknown) => void = () => {};
  vi.stubGlobal("fetch", async (url: string) =>
    url.endsWith("csrf")
      ? {
          ok: true,
          json: async () => ({ token: "t", headerName: "X-CSRF-TOKEN" }),
        }
      : new Promise((resolve) => {
          resolveSave = resolve;
        }),
  );
  render(<SettingsEditor initial={config} works={[]} categories={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  expect(screen.getByRole("textbox", { name: "品牌名称 *" })).toBeDisabled();
  await act(async () => {});
  await act(async () =>
    resolveSave({
      ok: true,
      json: async () => ({ ...config, draftRevision: 2 }),
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "品牌名称 *" })).toBeEnabled(),
  );
});
