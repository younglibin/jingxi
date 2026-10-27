import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { Uploads } from "../src/components/uploads";
import type { Asset } from "../src/lib/types";
afterEach(() => vi.unstubAllGlobals());
function transport() {
  let active = 0,
    maxActive = 0;
  const pending: {
    name: string;
    signal?: AbortSignal | null;
    finish: (ok?: boolean) => void;
  }[] = [];
  vi.stubGlobal("fetch", async (url: string, options: RequestInit = {}) => {
    if (url.endsWith("csrf"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ token: "t", headerName: "X-CSRF-TOKEN" }),
      };
    const file = (options.body as FormData).get("file") as File;
    active++;
    maxActive = Math.max(maxActive, active);
    return new Promise((resolve) =>
      pending.push({
        name: file.name,
        signal: options.signal,
        finish: (ok = true) => {
          active--;
          resolve({
            ok,
            status: ok ? 200 : 503,
            json: async () =>
              ok
                ? {
                    id: file.name,
                    originalName: file.name,
                    width: 100,
                    height: 100,
                    previewUrl: "/preview.png",
                    displayImages: [],
                  }
                : { message: "上传服务繁忙" },
          });
        },
      }),
    );
  });
  return {
    pending,
    get active() {
      return active;
    },
    get maxActive() {
      return maxActive;
    },
  };
}
const file = (name: string) => new File(["png"], name, { type: "image/png" });
it("serializes a multi-file selection, successive selections and retries through one component-wide queue", async () => {
  const http = transport(),
    added: Asset[] = [];
  render(<Uploads onAsset={(asset) => added.push(asset)} />);
  const input = screen.getByLabelText("上传图片文件");
  fireEvent.change(input, {
    target: { files: [file("a.png"), file("b.png")] },
  });
  await waitFor(() => expect(http.pending.length).toBeGreaterThan(0));
  await act(async () => {});
  expect(http.active).toBe(1);
  expect(http.pending.map((x) => x.name)).toEqual(["a.png"]);
  fireEvent.change(input, { target: { files: [file("c.png")] } });
  await act(async () => {});
  expect(http.pending).toHaveLength(1);
  await act(async () => http.pending[0].finish());
  await waitFor(() =>
    expect(http.pending.map((x) => x.name)).toEqual(["a.png", "b.png"]),
  );
  await act(async () => http.pending[1].finish(false));
  await waitFor(() =>
    expect(http.pending.map((x) => x.name)).toEqual([
      "a.png",
      "b.png",
      "c.png",
    ]),
  );
  fireEvent.click(screen.getByRole("button", { name: "重试 b.png" }));
  await act(async () => {});
  expect(http.pending).toHaveLength(3);
  await act(async () => http.pending[2].finish());
  await waitFor(() =>
    expect(http.pending.map((x) => x.name)).toEqual([
      "a.png",
      "b.png",
      "c.png",
      "b.png",
    ]),
  );
  await act(async () => http.pending[3].finish());
  await waitFor(() =>
    expect(added.map((x) => x.id)).toEqual(["a.png", "c.png", "b.png"]),
  );
  expect(http.maxActive).toBe(1);
});
it("does not publish a late cancelled result and waits for that request to settle before the next file", async () => {
  const http = transport(),
    added: Asset[] = [];
  render(<Uploads onAsset={(asset) => added.push(asset)} />);
  fireEvent.change(screen.getByLabelText("上传图片文件"), {
    target: { files: [file("a.png"), file("b.png")] },
  });
  await waitFor(() => expect(http.pending.length).toBeGreaterThan(0));
  fireEvent.click(screen.getByRole("button", { name: "取消上传" }));
  expect(http.pending[0].signal?.aborted).toBe(true);
  expect(added).toHaveLength(0);
  await act(async () => http.pending[0].finish());
  await waitFor(() => expect(http.pending).toHaveLength(2));
  expect(added).toHaveLength(0);
  await act(async () => http.pending[1].finish());
  await waitFor(() => expect(added.map((x) => x.id)).toEqual(["b.png"]));
  expect(http.maxActive).toBe(1);
});
