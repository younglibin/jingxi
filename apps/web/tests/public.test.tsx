import { it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Home, WorkDetail, SiteHeader } from "../src/components/public-site";
import { defaultSite } from "../src/lib/default-site";
it("labels empty hero cards as replaceable placeholders and hides empty optional sections", () => {
  render(<Home site={defaultSite} />);
  expect(screen.getAllByText("作品封面 · 可替换")).toHaveLength(6);
  expect(screen.queryByText("案例故事")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "浏览作品" })).toHaveAttribute(
    "href",
    "/works",
  );
});
it("renders the cover once and opens all images in their stored order", () => {
  render(
    <WorkDetail
      work={{
        publicKey: "p1",
        slug: "a-work",
        title: "项目A",
        summary: "简介",
        year: 2026,
        category: { slug: "brand", name: "品牌" },
        cover: { url: "/a.jpg", width: 800, height: 600 },
        blocks: [
          {
            id: "a",
            type: "image",
            sortOrder: 1,
            image: { url: "/a.jpg", width: 800, height: 600, alt: "主图" },
          },
          { id: "b", type: "text", sortOrder: 2, text: "设计背景" },
          {
            id: "c",
            type: "image",
            sortOrder: 3,
            image: { url: "/c.jpg", width: 800, height: 600, alt: "细节" },
          },
        ],
        relatedWorks: [],
      }}
    />,
  );
  expect(screen.getAllByRole("img", { name: "主图" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "放大 主图" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "上一张" })).toBeDisabled();
});
it("opens and closes the mobile menu accessibly", () => {
  render(<SiteHeader site={defaultSite} />);
  const menu = screen.getByRole("button", { name: "打开菜单" });
  fireEvent.click(menu);
  expect(screen.getByRole("dialog", { name: "导航菜单" })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("shows client and responsibility entered by the maintainer when provided", () => {
  render(
    <WorkDetail
      work={{
        publicKey: "p",
        slug: "project",
        title: "项目",
        summary: "",
        year: 2026,
        client: "测试客户",
        role: "品牌与包装",
        category: { slug: "other", name: "其他" },
        cover: { url: "/a.jpg", width: 1, height: 1 },
        blocks: [],
        relatedWorks: [],
      }}
    />,
  );
  expect(screen.getByText("测试客户")).toBeInTheDocument();
  expect(screen.getByText("品牌与包装")).toBeInTheDocument();
});
it("renders the selected fixed closing decoration icons", () => {
  render(
    <Home
      site={{
        ...defaultSite,
        homepage: {
          ...defaultSite.homepage,
          closing: {
            ...defaultSite.homepage.closing,
            iconKeys: ["circle", "flower"],
          },
        },
      }}
    />,
  );
  expect(screen.getByText("●")).toBeInTheDocument();
  expect(screen.getByText("✿")).toBeInTheDocument();
});
