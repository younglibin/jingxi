export type Block = {
  id: string;
  type: "image" | "text";
  sortOrder: number;
  assetId?: string;
  text?: string;
  alt?: string;
  caption?: string;
};
export type Content = {
  title: string;
  slug: string;
  categoryId: string;
  summary: string;
  client: string;
  year: number | null;
  role: string;
  coverImageId: string | null;
  coverCrop: { x: number; y: number; width: number; height: number } | null;
  coverFocal: { x: number; y: number } | null;
  blocks: Block[];
  relatedWorkIds: string[];
};
const renumber = (blocks: Block[]) =>
  blocks.map((b, i) => ({ ...b, sortOrder: i + 1 }));
export function setCover(
  c: Content,
  id: string,
  width: number,
  height: number,
): Content {
  const target = c.blocks.find((b) => b.id === id && b.type === "image");
  if (!target) return c;
  const r = width / height,
    t = 3 / 4,
    cw = r >= t ? t / r : 1,
    ch = r >= t ? 1 : r / t;
  return {
    ...c,
    coverImageId: id,
    coverCrop: { x: (1 - cw) / 2, y: (1 - ch) / 2, width: cw, height: ch },
    coverFocal: { x: 0.5, y: 0.5 },
    blocks: renumber([target, ...c.blocks.filter((b) => b.id !== id)]),
  };
}
export function deleteBlock(
  c: Content,
  id: string,
  dimensions: Record<string, { width: number; height: number }> = {},
): Content {
  const next = { ...c, blocks: renumber(c.blocks.filter((b) => b.id !== id)) };
  if (c.coverImageId !== id) return next;
  const image = next.blocks.find((b) => b.type === "image");
  if (!image)
    return { ...next, coverImageId: null, coverCrop: null, coverFocal: null };
  const d = dimensions[image.assetId || ""] || { width: 3, height: 4 };
  return setCover(next, image.id, d.width, d.height);
}
export function moveBlock(c: Content, id: string, offset: number): Content {
  const i = c.blocks.findIndex((b) => b.id === id),
    j = i + offset;
  if (
    i < 0 ||
    id === c.coverImageId ||
    j < (c.coverImageId ? 1 : 0) ||
    j >= c.blocks.length
  )
    return c;
  const blocks = [...c.blocks];
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  return { ...c, blocks: renumber(blocks) };
}
export function validateContent(
  c: Content,
  publish: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (c.title.length > 60 || (publish && !c.title.trim()))
    errors.title = "请填写1–60字标题";
  if (publish && !/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(c.slug))
    errors.slug = "访问标识须为3–80位小写字母、数字或连字符";
  if (
    publish &&
    !c.blocks.some((b) => b.id === c.coverImageId && b.type === "image")
  )
    errors.coverImageId = "请添加并设置首图";
  if (c.summary.length > 200) errors.summary = "简介最多200字";
  if (c.blocks.length > 30) errors.blocks = "最多30个内容块";
  if (publish && c.blocks.some((b) => b.type === "image" && !b.alt?.trim()))
    errors.blocks = "请为每张图片填写替代文字";
  if (
    c.year !== null &&
    (c.year < 1900 || c.year > new Date().getFullYear() + 1)
  )
    errors.year = "年份超出有效范围";
  return errors;
}
export function restoreBrowse(
  raw: string | null,
): { category: string; take: number; scroll: number; keys: string[] } | null {
  try {
    const s = JSON.parse(raw || "null");
    if (
      s &&
      typeof s.category === "string" &&
      Number.isInteger(s.take) &&
      s.take >= 12 &&
      s.take <= 1200 &&
      s.take % 12 === 0 &&
      Number.isFinite(s.scroll) &&
      s.scroll >= 0 &&
      Array.isArray(s.keys) &&
      s.keys.length <= 5000 &&
      s.keys.every((x: unknown) => typeof x === "string")
    )
      return s;
  } catch {}
  return null;
}
