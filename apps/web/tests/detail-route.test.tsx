import { it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND_ROUTE");
  },
}));
import Page from "../src/app/works/[slug]/page";
import { defaultSite } from "../src/lib/default-site";
afterEach(() => vi.unstubAllGlobals());
function backend(status: number | Error) {
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.endsWith("/site"))
      return { ok: true, status: 200, json: async () => defaultSite };
    if (status instanceof Error) throw status;
    return { ok: false, status, json: async () => ({ message: "未找到" }) };
  });
}
it("uses the not-found route only for an actual missing public work", async () => {
  backend(404);
  await expect(
    Page({ params: Promise.resolve({ slug: "project" }) }),
  ).rejects.toThrow("NOT_FOUND_ROUTE");
});
it("renders a retryable failure for a temporary backend outage instead of a missing work", async () => {
  backend(503);
  render(await Page({ params: Promise.resolve({ slug: "project" }) }));
  expect(screen.getByRole("alert")).toHaveTextContent("暂时无法加载");
  expect(screen.getByRole("link", { name: "重新加载" })).toHaveAttribute(
    "href",
    "/works/project",
  );
});
it("renders a retryable failure when the backend connection is lost", async () => {
  backend(new TypeError("fetch failed"));
  render(await Page({ params: Promise.resolve({ slug: "project" }) }));
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "重新加载" })).toHaveAttribute(
    "href",
    "/works/project",
  );
});
