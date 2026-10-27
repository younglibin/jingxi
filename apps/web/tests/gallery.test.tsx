import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Gallery } from "../src/components/public-site";
afterEach(() => vi.unstubAllGlobals());
it("suspends animation when offscreen or hidden and preserves an explicit pause after returning", () => {
  const scheduled = new Map<number, FrameRequestCallback>();
  let next = 0,
    observerCallback: (e: { isIntersecting: boolean }[]) => void = () => {};
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    scheduled.set(++next, cb);
    return next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => scheduled.delete(id));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: typeof observerCallback) {
        observerCallback = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  render(<Gallery works={[]} />);
  expect(scheduled.size).toBe(0);
  act(() => observerCallback([{ isIntersecting: true }]));
  expect(scheduled.size).toBe(1);
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: true,
  });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(scheduled.size).toBe(0);
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(scheduled.size).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "暂停画廊" }));
  expect(scheduled.size).toBe(0);
  act(() => observerCallback([{ isIntersecting: false }]));
  act(() => observerCallback([{ isIntersecting: true }]));
  expect(scheduled.size).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "继续播放" }));
  expect(scheduled.size).toBe(1);
});
