import { it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Lightbox } from "../src/components/lightbox";
import { SaveForm } from "../src/components/fields";
it("stops at the first and last image and closes on Escape", () => {
  let closed = false;
  render(
    <Lightbox
      images={[
        { url: "/a.jpg", alt: "第一张" },
        { url: "/b.jpg", alt: "第二张" },
      ]}
      index={0}
      onClose={() => {
        closed = true;
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "上一张" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "下一张" }));
  expect(screen.getByRole("img")).toHaveAttribute("alt", "第二张");
  expect(screen.getByRole("button", { name: "下一张" })).toBeDisabled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(closed).toBe(true);
});
it("keeps unsaved user input visible after a rejected save", async () => {
  render(
    <SaveForm
      initial="旧标题"
      onSave={async () => {
        throw new Error("版本冲突，请重新加载后比较");
      }}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "标题" }), {
    target: { value: "我的新标题" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("版本冲突"),
  );
  expect(screen.getByRole("textbox", { name: "标题" })).toHaveValue(
    "我的新标题",
  );
});
it("returns keyboard focus to the image trigger when its lightbox closes", async () => {
  const { WorkDetail } = await import("../src/components/public-site");
  const user = (await import("@testing-library/user-event")).default.setup();
  render(
    <WorkDetail
      work={{
        publicKey: "p1",
        slug: "project",
        title: "项目",
        summary: "",
        year: null,
        category: { slug: "other", name: "其他" },
        cover: { url: "/a.jpg", width: 1, height: 1 },
        blocks: [
          {
            id: "a",
            type: "image",
            sortOrder: 1,
            image: { url: "/a.jpg", width: 1, height: 1, alt: "主图" },
          },
        ],
        relatedWorks: [],
      }}
    />,
  );
  const trigger = screen.getByRole("button", { name: "放大 主图" });
  await user.click(trigger);
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
});
