"use client";
import { useEffect, useState } from "react";
import type { Work, Category, Asset } from "@/lib/types";
import {
  setCover,
  deleteBlock,
  moveBlock,
  validateContent,
  type Content,
} from "@/lib/editor";
import { request, errorMessage, ApiError } from "@/lib/api";
import { Field } from "./fields";
import { CoverImage } from "./cards";
import { Uploads, AssetSelector } from "./uploads";
export function WorkEditor({
  initial,
  categories,
  assets: initialAssets = [],
}: {
  initial: Work;
  categories: Category[];
  assets?: Asset[];
}) {
  const [work, setWork] = useState(initial),
    [content, setContent] = useState<Content>(initial.draft.content),
    [assets, setAssets] = useState(initialAssets),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [previewHref, setPreviewHref] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [validation, setValidation] = useState<Record<string, string>>({});
  const edit = (c: Content) => {
    setContent(c);
    setDirty(true);
  };
  const field = (k: keyof Content, v: unknown) => edit({ ...content, [k]: v });
  const dimensions = Object.fromEntries(assets.map((a) => [a.id, a]));
  const assetFor = (id?: string) => assets.find((a) => a.id === id);
  const imageUrl = (id?: string) => {
    const a = assetFor(id);
    return a?.previewUrl || a?.displayImages?.[0]?.url || "";
  };
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const save = async () => {
    const errors = validateContent(content, false);
    setValidation(errors);
    if (Object.keys(errors).length) throw new Error("请检查表单字段");
    const saved = await request<Work>(`/api/admin/v1/works/${work.id}/draft`, {
      method: "PUT",
      body: JSON.stringify({
        expectedDraftRevision: work.draftRevision,
        content,
      }),
    });
    setWork(saved);
    setContent(saved.draft.content);
    setDirty(false);
    setNotice(`草稿已保存 · 版本 ${saved.draftRevision}`);
    return saved;
  };
  const act = async (action: "save" | "publish" | "preview" | "unpublish") => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (action === "unpublish") {
        const updated = await request<Work>(
          `/api/admin/v1/works/${work.id}/unpublish`,
          {
            method: "POST",
            body: JSON.stringify({ expectedStateRevision: work.stateRevision }),
          },
        );
        setWork(updated);
        setNotice("作品已下架");
        return;
      }
      if (action === "publish") {
        const errors = validateContent(content, true);
        setValidation(errors);
        if (Object.keys(errors).length) throw new Error("请完成发布检查");
      }
      const saved = await save();
      if (action === "preview") {
        setPreviewHref(
          `/admin/preview/works/${saved.id}?revision=${saved.draftRevision}`,
        );
        window.open(
          `/admin/preview/works/${saved.id}?revision=${saved.draftRevision}`,
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }
      if (action === "publish") {
        const updated = await request<Work>(
          `/api/admin/v1/works/${saved.id}/publish`,
          {
            method: "POST",
            body: JSON.stringify({
              targetDraftRevision: saved.draftRevision,
              expectedStateRevision: saved.stateRevision,
            }),
          },
        );
        setWork(updated);
        setNotice("作品已发布，访客现在可见");
      }
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.body.fieldErrors)
        setValidation(
          Object.fromEntries(
            e.body.fieldErrors.map((f) => [f.field, f.message]),
          ),
        );
    } finally {
      setBusy(false);
    }
  };
  const focal = (axis: "x" | "y", value: string) => {
    const point = {
      x: content.coverFocal?.x ?? 0.5,
      y: content.coverFocal?.y ?? 0.5,
      [axis]: Math.max(0, Math.min(1, Number(value))),
    };
    const crop = content.coverCrop;
    edit({
      ...content,
      coverFocal: point,
      coverCrop: crop
        ? {
            ...crop,
            x: Math.max(0, Math.min(1 - crop.width, point.x - crop.width / 2)),
            y: Math.max(
              0,
              Math.min(1 - crop.height, point.y - crop.height / 2),
            ),
          }
        : null,
    });
  };
  const zoomCover = (value: string) => {
    const coverBlock = content.blocks.find(
      (b) => b.id === content.coverImageId,
    );
    const a = assetFor(coverBlock?.assetId);
    if (!a || !content.coverImageId) return;
    const initial = setCover(
      content,
      content.coverImageId,
      a.width,
      a.height,
    ).coverCrop!;
    const scale = Math.max(1, Math.min(3, Number(value)));
    const width = initial.width / scale,
      height = initial.height / scale;
    const focal = content.coverFocal || { x: 0.5, y: 0.5 };
    edit({
      ...content,
      coverCrop: {
        width,
        height,
        x: Math.max(0, Math.min(1 - width, focal.x - width / 2)),
        y: Math.max(0, Math.min(1 - height, focal.y - height / 2)),
      },
    });
  };
  const cover = content.blocks.find((b) => b.id === content.coverImageId);
  const addImage = (a: Asset) => {
    if (content.blocks.length >= 30) {
      setError("最多30个内容块");
      return;
    }
    const b = {
      id: crypto.randomUUID(),
      type: "image" as const,
      sortOrder: content.blocks.length + 1,
      assetId: a.id,
      alt: content.title,
      caption: "",
    };
    const next = { ...content, blocks: [...content.blocks, b] };
    edit(content.coverImageId ? next : setCover(next, b.id, a.width, a.height));
  };
  const replace = (id: string, assetId: string | null) => {
    if (!assetId) return;
    const next = {
      ...content,
      blocks: content.blocks.map((b) => (b.id === id ? { ...b, assetId } : b)),
    };
    const a = assetFor(assetId)!;
    edit(
      id === content.coverImageId
        ? setCover(next, id, a.width, a.height)
        : next,
    );
  };
  return (
    <>
      <h1>编辑作品</h1>
      <p className="muted">
        {work.visible
          ? "已发布作品可保存修改草稿，发布前不影响线上版本。"
          : "先保存草稿，预览确认后再发布作品。"}
      </p>
      <div className="actions">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => act("save")}
        >
          保存草稿
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => act("preview")}
        >
          保存并预览
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={() => act("publish")}
        >
          {work.published ? "发布修改" : "发布作品"}
        </button>
        {work.visible && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => act("unpublish")}
          >
            下架作品
          </button>
        )}
        <span className="badge">
          {dirty ? "有未保存修改" : `草稿版本 ${work.draftRevision}`}
        </span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {Object.keys(validation).length > 0 && (
        <ul className="error" aria-label="字段检查结果">
          {Object.entries(validation).map(([field, message]) => (
            <li key={field}>{message}</li>
          ))}
        </ul>
      )}
      {previewHref && (
        <p className="actions">
          <a
            className="button secondary"
            href={previewHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            打开已保存预览 ↗
          </a>
        </p>
      )}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      <fieldset className="editor-layout editor-controls" disabled={busy}>
        <div className="panel">
          <Field
            label="作品标题 *"
            value={content.title}
            onChange={(v) => field("title", v)}
          />
          {validation.title && <p className="error">{validation.title}</p>}
          <Field
            label="访问标识 *"
            value={content.slug}
            disabled={!!work.lockedSlug}
            onChange={(v) => field("slug", v)}
          />
          {work.lockedSlug && (
            <p className="muted small">首次发布后访问标识固定。</p>
          )}
          {validation.slug && <p className="error">{validation.slug}</p>}
          <div className="field-row">
            <label className="field">
              作品分类 *
              <select
                value={content.categoryId}
                onChange={(e) => field("categoryId", e.target.value)}
              >
                {categories.map((c) => (
                  <option
                    key={c.id}
                    value={c.id}
                    disabled={!c.enabled && content.categoryId !== c.id}
                  >
                    {c.name}
                    {!c.enabled ? "（停用）" : ""}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="年份"
              type="number"
              value={content.year ?? ""}
              onChange={(v) => field("year", v ? Number(v) : null)}
            />
          </div>
          <Field
            label="项目摘要"
            value={content.summary}
            multiline
            onChange={(v) => field("summary", v)}
          />
          <div className="field-row">
            <Field
              label="客户"
              value={content.client}
              onChange={(v) => field("client", v)}
            />
            <Field
              label="承担角色"
              value={content.role}
              onChange={(v) => field("role", v)}
            />
          </div>
          <h2>正文内容</h2>
          <p className="muted small">
            首图固定在第一项；图文共用一个顺序。最多30块。
          </p>
          {content.blocks.map((b, i) => (
            <section
              key={b.id}
              className={`content-block ${b.id === content.coverImageId ? "is-cover" : ""}`}
            >
              <div className="block-toolbar">
                <span>
                  {b.type === "image" ? "图片" : "文字"} {i + 1}
                  {b.id === content.coverImageId ? " · 首图" : ""}
                </span>
                <div>
                  <button
                    disabled={
                      i <= (content.coverImageId ? 1 : 0) ||
                      b.id === content.coverImageId
                    }
                    onClick={() => edit(moveBlock(content, b.id, -1))}
                  >
                    上移
                  </button>
                  <button
                    disabled={
                      i === content.blocks.length - 1 ||
                      b.id === content.coverImageId
                    }
                    onClick={() => edit(moveBlock(content, b.id, 1))}
                  >
                    下移
                  </button>
                  {b.type === "image" && b.id !== content.coverImageId && (
                    <button
                      onClick={() => {
                        const a = assetFor(b.assetId);
                        if (a) edit(setCover(content, b.id, a.width, a.height));
                      }}
                    >
                      设为首图
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (
                        b.id === content.coverImageId &&
                        !window.confirm(
                          "删除首图后，将提升剩余第一张图片为首图。确认删除？",
                        )
                      )
                        return;
                      edit(deleteBlock(content, b.id, dimensions));
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
              {b.type === "text" ? (
                <Field
                  label={`文字内容 ${i + 1}`}
                  value={b.text || ""}
                  multiline
                  onChange={(v) =>
                    field(
                      "blocks",
                      content.blocks.map((x) =>
                        x.id === b.id ? { ...x, text: v } : x,
                      ),
                    )
                  }
                />
              ) : (
                <>
                  {imageUrl(b.assetId) && (
                    <img
                      className="block-image"
                      src={imageUrl(b.assetId)}
                      alt={b.alt || ""}
                    />
                  )}
                  <Field
                    label={`图片替代文字 ${i + 1}`}
                    value={b.alt || ""}
                    onChange={(v) =>
                      field(
                        "blocks",
                        content.blocks.map((x) =>
                          x.id === b.id ? { ...x, alt: v } : x,
                        ),
                      )
                    }
                  />
                  <Field
                    label={`图片图注 ${i + 1}`}
                    value={b.caption || ""}
                    onChange={(v) =>
                      field(
                        "blocks",
                        content.blocks.map((x) =>
                          x.id === b.id ? { ...x, caption: v } : x,
                        ),
                      )
                    }
                  />
                  <AssetSelector
                    label={`替换图片 ${i + 1}`}
                    value={b.assetId || null}
                    assets={assets}
                    onChange={(id) => replace(b.id, id)}
                  />
                </>
              )}
            </section>
          ))}
          {validation.blocks && <p className="error">{validation.blocks}</p>}
          <button
            className="button secondary"
            disabled={content.blocks.length >= 30}
            onClick={() =>
              field("blocks", [
                ...content.blocks,
                {
                  id: crypto.randomUUID(),
                  type: "text",
                  sortOrder: content.blocks.length + 1,
                  text: "",
                },
              ])
            }
          >
            添加文字块
          </button>
          <Uploads
            onAsset={(a) =>
              setAssets((items) => [a, ...items.filter((x) => x.id !== a.id)])
            }
          />
          {assets.length > 0 && (
            <details open>
              <summary>选择图片资源 · 点击加入作品</summary>
              <div className="asset-grid">
                {assets.map((a) => (
                  <figure key={a.id}>
                    <img
                      src={a.previewUrl || a.displayImages?.[0]?.url}
                      alt={a.originalName}
                    />
                    <figcaption>{a.originalName}</figcaption>
                    <button onClick={() => addImage(a)}>加入作品</button>
                  </figure>
                ))}
              </div>
            </details>
          )}
          <RelatedSelector
            value={content.relatedWorkIds}
            onChange={(v) => field("relatedWorkIds", v)}
            currentId={work.id}
          />
        </div>
        <aside className="editor-aside">
          <div className="panel">
            <h2>封面图片</h2>
            {cover && imageUrl(cover.assetId) ? (
              <>
                <div className="crop-preview">
                  <CoverImage
                    image={{
                      url: imageUrl(cover.assetId),
                      width: assetFor(cover.assetId)?.width || 3,
                      height: assetFor(cover.assetId)?.height || 4,
                      crop: content.coverCrop || undefined,
                      focal: content.coverFocal || undefined,
                    }}
                    alt="封面预览"
                  />
                </div>
                <p className="muted small">3:4封面 · 原图完整保留</p>
                <label className="field">
                  封面缩放（1–3）
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.05"
                    defaultValue="1"
                    onChange={(e) => zoomCover(e.target.value)}
                  />
                </label>
                <Field
                  label="水平焦点（0–1）"
                  value={content.coverFocal?.x ?? 0.5}
                  type="number"
                  onChange={(v) => focal("x", v)}
                />
                <Field
                  label="垂直焦点（0–1）"
                  value={content.coverFocal?.y ?? 0.5}
                  type="number"
                  onChange={(v) => focal("y", v)}
                />
                {content.coverCrop && (
                  <>
                    <p className="small muted">裁剪区域（0–1）</p>
                    <Field
                      label="裁剪横坐标"
                      type="number"
                      value={content.coverCrop.x}
                      onChange={(v) =>
                        field("coverCrop", {
                          ...content.coverCrop,
                          x: Math.max(
                            0,
                            Math.min(1 - content.coverCrop!.width, Number(v)),
                          ),
                        })
                      }
                    />
                    <Field
                      label="裁剪纵坐标"
                      type="number"
                      value={content.coverCrop.y}
                      onChange={(v) =>
                        field("coverCrop", {
                          ...content.coverCrop,
                          y: Math.max(
                            0,
                            Math.min(1 - content.coverCrop!.height, Number(v)),
                          ),
                        })
                      }
                    />
                  </>
                )}
              </>
            ) : (
              <p className="empty muted">
                上传图片并加入作品后，第一张自动成为首图。
              </p>
            )}
            {validation.coverImageId && (
              <p className="error">{validation.coverImageId}</p>
            )}
            <h2>发布检查</h2>
            <ul className="small">
              <li>{content.title.trim() ? "✓" : "○"} 作品标题</li>
              <li>{content.coverImageId ? "✓" : "○"} 封面已设置</li>
              <li>
                {content.blocks.every(
                  (b) => b.type !== "image" || b.alt?.trim(),
                )
                  ? "✓"
                  : "○"}{" "}
                图片替代文字
              </li>
              <li>{content.blocks.length ? "✓" : "○"} 正文内容</li>
            </ul>
            <p className="small muted">
              保存版本 {work.draftRevision} ·{" "}
              {work.visible ? "线上可见" : "未公开"}
            </p>
          </div>
        </aside>
      </fieldset>
    </>
  );
}
function RelatedSelector({
  value,
  onChange,
  currentId,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  currentId: string;
}) {
  const [works, setWorks] = useState<Work[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      const items: Work[] = [];
      let page = 1,
        total = 1;
      while (items.length < total) {
        const result = await request<{ items: Work[]; total: number }>(
          `/api/admin/v1/works?state=published&page=${page}`,
        );
        items.push(...(result.items || []));
        total = result.total || 0;
        if (!result.items?.length) break;
        page++;
      }
      if (active) setWorks(items);
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="settings-section">
      <h3>相关作品（最多3项）</h3>
      {value.map((id, i) => (
        <div className="selected-work" key={id}>
          <span>
            {works.find((w) => w.id === id)?.draft.content.title || id}
          </span>
          <button onClick={() => onChange(value.filter((x) => x !== id))}>
            移除
          </button>
          <button
            disabled={!i}
            onClick={() => {
              const ids = [...value];
              [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
              onChange(ids);
            }}
          >
            上移
          </button>
        </div>
      ))}
      <select
        aria-label="添加相关作品"
        value=""
        disabled={value.length >= 3}
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
      >
        <option value="">选择公开作品</option>
        {works
          .filter((w) => w.id !== currentId && !value.includes(w.id))
          .map((w) => (
            <option key={w.id} value={w.id}>
              {w.draft.content.title}
            </option>
          ))}
      </select>
    </div>
  );
}
