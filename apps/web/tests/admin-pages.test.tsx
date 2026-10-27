import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  LoginForm,
  WorksAdmin,
  CategoriesAdmin,
} from "../src/components/admin";
import { request } from "../src/lib/api";
afterEach(() => vi.unstubAllGlobals());
const work = {
  id: "w1",
  publicKey: "p1",
  lockedSlug: null,
  draftRevision: 1,
  stateRevision: 4,
  draft: {
    content: {
      title: "测试作品",
      slug: "test-work",
      categoryId: "other",
      summary: "",
      year: null,
      blocks: [],
      relatedWorkIds: [],
      coverImageId: null,
    },
  },
  published: null,
  visible: false,
  recycledAt: null,
};
it("keeps credentials entered when authentication fails and communicates the error", async () => {
  vi.stubGlobal("fetch", async (url: string) =>
    url.endsWith("csrf")
      ? {
          ok: true,
          json: async () => ({ token: "t", headerName: "X-CSRF-TOKEN" }),
        }
      : {
          ok: false,
          status: 401,
          json: async () => ({ message: "用户名或密码错误" }),
        },
  );
  render(<LoginForm />);
  fireEvent.change(screen.getByLabelText("用户名"), {
    target: { value: "maintainer" },
  });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "wrong" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登录管理后台" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("用户名或密码错误"),
  );
  expect(screen.getByLabelText("用户名")).toHaveValue("maintainer");
});
it("loads management results, searches and moves a draft to the recycle bin with its current revision", async () => {
  let recycled = false;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => ({
    ok: true,
    status: 200,
    json: async () => {
      if (url.endsWith("csrf"))
        return { token: "t", headerName: "X-CSRF-TOKEN" };
      if (url.includes("categories")) return { items: [] };
      if (url.endsWith("/recycle")) {
        const body = JSON.parse(init.body as string);
        if (body.expectedStateRevision !== 4) throw Error("wrong revision");
        recycled = true;
        return { ...work, recycledAt: "2026-10-27" };
      }
      return {
        items: recycled ? [] : [work],
        total: recycled ? 0 : 1,
        page: 1,
        pageSize: 20,
      };
    },
  }));
  render(<WorksAdmin />);
  await screen.findByText("测试作品");
  fireEvent.click(screen.getByRole("button", { name: "移入回收站" }));
  await waitFor(() =>
    expect(screen.queryByText("测试作品")).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "新建作品" })).toBeInTheDocument();
});
it("public browse never requests a session or csrf token", async () => {
  let calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    return {
      ok: true,
      json: async () => ({
        items: [],
        total: 0,
        hasMore: false,
        categoryCounts: {},
      }),
    };
  });
  await request("/api/public/v1/works/browse", {
    method: "POST",
    body: '{"orderedPublicKeys":[],"take":12}',
  });
  expect(calls).toBe(1);
});
