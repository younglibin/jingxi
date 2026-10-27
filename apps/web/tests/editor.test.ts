import { describe, it, expect } from "vitest";
import {
  setCover,
  deleteBlock,
  moveBlock,
  validateContent,
  restoreBrowse,
  type Content,
} from "../src/lib/editor";
const content: Content = {
  title: "Test",
  slug: "test-work",
  categoryId: "cat",
  summary: "",
  client: "",
  year: 2026,
  role: "",
  coverImageId: "a",
  coverCrop: null,
  coverFocal: null,
  relatedWorkIds: [],
  blocks: [
    { id: "a", type: "image", sortOrder: 1, assetId: "aa", alt: "a" },
    { id: "t", type: "text", sortOrder: 2, text: "Body" },
    { id: "b", type: "image", sortOrder: 3, assetId: "bb", alt: "b" },
    { id: "c", type: "image", sortOrder: 4, assetId: "cc", alt: "c" },
  ],
};
describe("cover editing invariants", () => {
  it("moves the selected cover before text while preserving other relative order and resetting crop", () => {
    const c = setCover(content, "c", 1600, 800);
    expect(c.blocks.map((b) => b.id)).toEqual(["c", "a", "t", "b"]);
    expect(c.coverImageId).toBe("c");
    expect(c.coverCrop).toEqual({ x: 0.3125, y: 0, width: 0.375, height: 1 });
    expect(c.coverFocal).toEqual({ x: 0.5, y: 0.5 });
    expect(content.blocks[0].id).toBe("a");
  });
  it("promotes the earliest remaining image when cover is deleted", () => {
    const c = deleteBlock(content, "a", { bb: { width: 800, height: 1600 } });
    expect(c.blocks.map((b) => b.id)).toEqual(["b", "t", "c"]);
    expect(c.blocks.map((b) => b.sortOrder)).toEqual([1, 2, 3]);
    expect(c.coverImageId).toBe("b");
    expect(c.coverCrop?.y).toBeCloseTo(1 / 6);
    expect(c.coverCrop?.height).toBeCloseTo(2 / 3);
  });
  it("clears cover and crop when last image is removed", () => {
    const c = deleteBlock({ ...content, blocks: [content.blocks[0]] }, "a");
    expect(c.coverImageId).toBeNull();
    expect(c.coverCrop).toBeNull();
    expect(c.coverFocal).toBeNull();
  });
  it("keeps the cover first when moving other blocks upwards", () => {
    expect(moveBlock(content, "t", -1).blocks.map((b) => b.id)).toEqual([
      "a",
      "t",
      "b",
      "c",
    ]);
    expect(moveBlock(content, "c", -1).blocks.map((b) => b.id)).toEqual([
      "a",
      "t",
      "c",
      "b",
    ]);
  });
  it("allows incomplete drafts but prevents publishing missing title, cover and invalid slug", () => {
    const c = { ...content, title: "", slug: "Bad Slug", coverImageId: null };
    expect(validateContent(c, false)).toEqual({});
    expect(validateContent(c, true)).toMatchObject({
      title: expect.any(String),
      slug: expect.any(String),
      coverImageId: expect.any(String),
    });
  });
  it("restores valid list state and rejects malformed or oversized state", () => {
    expect(
      restoreBrowse(
        JSON.stringify({
          category: "brand",
          take: 24,
          scroll: 800,
          keys: ["p1", "p2"],
        }),
      ),
    ).toEqual({ category: "brand", take: 24, scroll: 800, keys: ["p1", "p2"] });
    expect(restoreBrowse("{oops")).toBeNull();
    expect(
      restoreBrowse(
        JSON.stringify({ category: "", take: 99999, scroll: 0, keys: [] }),
      ),
    ).toBeNull();
  });
});
