import { afterEach, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { SettingsEditor } from "../src/components/settings-editor";
import { CategoriesAdmin } from "../src/components/admin";
import { defaultSite } from "../src/lib/default-site";

afterEach(() => vi.unstubAllGlobals());
const initial = () => ({
  draftRevision: 1,
  stateRevision: 1,
  draft: { content: structuredClone(defaultSite) },
  published: null,
});
const tab = (name: string) => screen.getByRole("tab", { name });

it("shows one settings group and one homepage module at a time", () => {
  render(<SettingsEditor initial={initial()} works={[]} categories={[]} />);
  expect(tab("品牌资料")).toHaveAttribute("aria-selected", "true");
  expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  expect(screen.getByLabelText("品牌名称 *")).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "关于介绍" }),
  ).not.toBeInTheDocument();
  fireEvent.click(tab("关于我们"));
  expect(screen.getByLabelText("关于介绍")).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "品牌名称 *" }),
  ).not.toBeInTheDocument();
  fireEvent.click(tab("联系方式"));
  expect(screen.getByLabelText("公开邮箱")).toBeVisible();
  fireEvent.click(tab("首页模块"));
  expect(screen.getByLabelText("首屏标题")).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "精选标题" }),
  ).not.toBeInTheDocument();
  fireEvent.click(tab("精选作品"));
  expect(screen.getByLabelText("精选标题")).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "首屏标题" }),
  ).not.toBeInTheDocument();
});

it("keeps edits across tabs and saves all edited groups together", async () => {
  const config = initial();
  let saved: any;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => ({
    ok: true,
    json: async () => {
      if (url.endsWith("csrf"))
        return { token: "t", headerName: "X-CSRF-TOKEN" };
      saved = JSON.parse(init.body as string);
      return { ...config, draftRevision: 2, draft: { content: saved.content } };
    },
  }));
  render(<SettingsEditor initial={config} works={[]} categories={[]} />);
  fireEvent.change(screen.getByLabelText("品牌名称 *"), {
    target: { value: "新工作室" },
  });
  fireEvent.click(tab("联系方式"));
  fireEvent.change(screen.getByLabelText("公开邮箱"), {
    target: { value: "hello@example.com" },
  });
  fireEvent.click(tab("首页模块"));
  fireEvent.change(screen.getByLabelText("首屏标题"), {
    target: { value: "新的首屏" },
  });
  fireEvent.click(tab("精选作品"));
  fireEvent.change(screen.getByLabelText("精选标题"), {
    target: { value: "新的精选" },
  });
  fireEvent.click(tab("首屏作品"));
  expect(screen.getByLabelText("首屏标题")).toHaveValue("新的首屏");
  fireEvent.click(tab("品牌资料"));
  expect(screen.getByLabelText("品牌名称 *")).toHaveValue("新工作室");
  fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("已保存"),
  );
  expect(saved.content.brand.name).toBe("新工作室");
  expect(saved.content.contact.email).toBe("hello@example.com");
  expect(saved.content.homepage.hero.title).toBe("新的首屏");
  expect(saved.content.homepage.featured.title).toBe("新的精选");
});

it("supports arrow, Home and End keys for settings tab navigation", () => {
  render(<SettingsEditor initial={initial()} works={[]} categories={[]} />);
  tab("品牌资料").focus();
  fireEvent.keyDown(tab("品牌资料"), { key: "ArrowRight" });
  expect(tab("关于我们")).toHaveFocus();
  expect(tab("关于我们")).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(tab("关于我们"), { key: "End" });
  expect(tab("图片素材")).toHaveFocus();
  fireEvent.keyDown(tab("图片素材"), { key: "Home" });
  expect(tab("品牌资料")).toHaveFocus();
});

it("creates a category with its name alone and shows the generated readable link", async () => {
  let created = false;
  const category = {
    id: "c1",
    name: "包装设计",
    slug: "bao-zhuang-she-ji",
    enabled: true,
    system: false,
    sortOrder: 2,
    revision: 1,
    deletedAt: null,
  };
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => ({
    ok: true,
    json: async () => {
      if (url.endsWith("csrf"))
        return { token: "t", headerName: "X-CSRF-TOKEN" };
      if (init.method === "POST") {
        expect(JSON.parse(init.body as string)).toEqual({ name: "包装设计" });
        created = true;
        return category;
      }
      return { items: created ? [category] : [] };
    },
  }));
  render(<CategoriesAdmin />);
  const form = screen
    .getByRole("heading", { name: "新建分类" })
    .closest("section")!;
  expect(
    within(form).queryByRole("textbox", { name: /访问标识/ }),
  ).not.toBeInTheDocument();
  fireEvent.change(within(form).getByLabelText("分类名称"), {
    target: { value: "包装设计" },
  });
  fireEvent.click(within(form).getByRole("button", { name: "新建分类" }));
  await screen.findByText("/works?category=bao-zhuang-she-ji");
  expect(within(form).getByLabelText("分类名称")).toHaveValue("");
});
