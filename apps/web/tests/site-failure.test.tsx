import { it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { getSite } from "../src/lib/server";
import { Home } from "../src/components/public-site";
afterEach(() => vi.unstubAllGlobals());
it("distinguishes an unavailable backend from a valid empty portfolio and offers retry", async () => {
  vi.stubGlobal("fetch", async () => ({ ok: false, status: 503 }));
  const site = await getSite();
  render(<Home site={site} />);
  expect(screen.getByRole("alert")).toHaveTextContent("暂时无法加载");
  expect(screen.getByRole("link", { name: "重新加载" })).toHaveAttribute(
    "href",
    "/",
  );
  expect(screen.queryByText("作品封面 · 可替换")).not.toBeInTheDocument();
});
