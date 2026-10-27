"use client";
import { useState } from "react";
import { decorationIcons } from "@/lib/icons";
import type { Work, Category, Asset } from "@/lib/types";
import { request, errorMessage } from "@/lib/api";
import { Field } from "./fields";
import { Uploads, AssetSelector } from "./uploads";
export type SiteConfig = {
  draftRevision: number;
  stateRevision: number;
  draft: { content: any };
  published: any;
};
function OrderedPicker({
  label,
  value,
  onChange,
  options,
  limit,
}: {
  label: string;
  value: string[];
  onChange: (ids: string[]) => void;
  options: { id: string; name: string }[];
  limit: number;
}) {
  return (
    <div>
      <p className="small muted">
        {label} · 已选{value.length}/{limit}，可调整顺序
      </p>
      {value.map((id, i) => (
        <div className="selected-work" key={id}>
          <span>{options.find((o) => o.id === id)?.name || id}</span>
          <button
            type="button"
            aria-label={`${label}第${i + 1}项上移`}
            disabled={i === 0}
            onClick={() => {
              const ids = [...value];
              [ids[i], ids[i - 1]] = [ids[i - 1], ids[i]];
              onChange(ids);
            }}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`${label}第${i + 1}项下移`}
            disabled={i === value.length - 1}
            onClick={() => {
              const ids = [...value];
              [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
              onChange(ids);
            }}
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== id))}
          >
            移除
          </button>
        </div>
      ))}
      <label className="field">
        添加{label}
        <select
          value=""
          disabled={value.length >= limit}
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value]);
          }}
        >
          <option value="">选择一项</option>
          {options
            .filter((o) => !value.includes(o.id))
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
export function SettingsEditor({
  initial,
  works,
  categories,
  assets: initialAssets = [],
}: {
  initial: SiteConfig;
  works: Work[];
  categories: Category[];
  assets?: Asset[];
}) {
  const [config, setConfig] = useState(initial),
    [content, setContent] = useState(initial.draft.content),
    [assets, setAssets] = useState(initialAssets),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [previewHref, setPreviewHref] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const set = (path: string, value: unknown) =>
    setContent((previous: any) => {
      const next = structuredClone(previous),
        parts = path.split(".");
      let cursor = next;
      for (const p of parts.slice(0, -1)) cursor = cursor[p];
      cursor[parts.at(-1)!] = value;
      setDirty(true);
      return next;
    });
  const h = content.homepage;
  const workOptions = works
    .filter((w) => w.visible && !w.recycledAt)
    .map((w) => ({
      id: w.id,
      name: w.published?.content.title || w.draft.content.title || "未命名作品",
    }));
  const save = async () => {
    if (!content.brand.name.trim()) throw new Error("请填写品牌名称");
    const result = await request<SiteConfig>("/api/admin/v1/site/draft", {
      method: "PUT",
      body: JSON.stringify({
        expectedDraftRevision: config.draftRevision,
        content,
      }),
    });
    setConfig(result);
    setContent(result.draft.content);
    setDirty(false);
    return result;
  };
  const action = async (kind: "save" | "publish" | "preview") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await save();
      if (kind === "publish") {
        const published = await request<SiteConfig>(
          "/api/admin/v1/site/publish",
          {
            method: "POST",
            body: JSON.stringify({
              targetDraftRevision: saved.draftRevision,
              expectedStateRevision: saved.stateRevision,
            }),
          },
        );
        setConfig(published);
        setNotice("网站配置已发布");
      } else if (kind === "preview") {
        setPreviewHref(`/admin/preview/site?revision=${saved.draftRevision}`);
        window.open(
          `/admin/preview/site?revision=${saved.draftRevision}`,
          "_blank",
          "noopener,noreferrer",
        );
      } else setNotice(`网站配置草稿已保存 · 版本 ${saved.draftRevision}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const sectionTitle = (key: string, title: string, fixed = false) => (
    <div className="settings-heading">
      <h2>{title}</h2>
      {fixed ? (
        <span className="badge">固定启用</span>
      ) : (
        <label className="check">
          <input
            type="checkbox"
            checked={h[key].enabled}
            onChange={(e) => set(`homepage.${key}.enabled`, e.target.checked)}
          />
          已启用
        </label>
      )}
    </div>
  );
  const picker = (key: string, field: string, label: string, limit: number) => (
    <OrderedPicker
      label={label}
      value={h[key][field] || []}
      onChange={(v) => set(`homepage.${key}.${field}`, v)}
      options={workOptions}
      limit={limit}
    />
  );
  const point = (label: string, path: string) => (
    <div className="field-row">
      {["x", "y"].map((axis) => (
        <Field
          key={axis}
          label={`${label}${axis === "x" ? "水平" : "垂直"}焦点（0–1）`}
          type="number"
          value={path.split(".").reduce((o, k) => o[k], content)[axis]}
          onChange={(v) =>
            set(`${path}.${axis}`, Math.max(0, Math.min(1, Number(v))))
          }
        />
      ))}
    </div>
  );
  return (
    <>
      <h1>网站设置</h1>
      <p className="muted">更新品牌内容和首页作品集合，保存后可预览再发布。</p>
      <div className="actions">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => action("save")}
        >
          保存草稿
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => action("preview")}
        >
          保存并整站预览
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={() => action("publish")}
        >
          发布网站配置
        </button>
        <span className="badge">
          {dirty ? "有未保存修改" : `版本 ${config.draftRevision}`}
        </span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
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
      <fieldset className="editor-controls" disabled={busy}>
        <div className="panel">
          <h2>品牌与联系</h2>
          <Field
            label="品牌名称 *"
            value={content.brand.name}
            onChange={(v) => set("brand.name", v)}
          />
          <Field
            label="品牌简介"
            value={content.brand.tagline}
            onChange={(v) => set("brand.tagline", v)}
          />
          <AssetSelector
            label="品牌标志"
            assets={assets}
            value={content.brand.logoAssetId}
            onChange={(v) => set("brand.logoAssetId", v)}
          />
          <Field
            label="关于介绍"
            value={content.about.description}
            multiline
            onChange={(v) => set("about.description", v)}
          />
          <AssetSelector
            label="关于主图"
            assets={assets}
            value={content.about.mainAssetId}
            onChange={(v) => set("about.mainAssetId", v)}
          />
          <h3>团队图片</h3>
          {content.about.teamImages.map((item: any, i: number) => (
            <div className="content-block" key={i}>
              <AssetSelector
                label={`团队图片 ${i + 1}`}
                assets={assets}
                value={item.assetId}
                onChange={(v) => set(`about.teamImages.${i}.assetId`, v)}
              />
              <Field
                label={`团队图注 ${i + 1}`}
                value={item.caption || ""}
                onChange={(v) => set(`about.teamImages.${i}.caption`, v)}
              />
              <button
                onClick={() =>
                  set(
                    "about.teamImages",
                    content.about.teamImages.filter(
                      (_: unknown, j: number) => i !== j,
                    ),
                  )
                }
              >
                移除团队图片
              </button>
              <button
                disabled={!i}
                onClick={() => {
                  const list = [...content.about.teamImages];
                  [list[i], list[i - 1]] = [list[i - 1], list[i]];
                  set("about.teamImages", list);
                }}
              >
                上移图片
              </button>
            </div>
          ))}
          <button
            className="button secondary"
            disabled={content.about.teamImages.length >= 6}
            onClick={() =>
              set("about.teamImages", [
                ...content.about.teamImages,
                { assetId: null, caption: "" },
              ])
            }
          >
            添加团队图片
          </button>
          <div className="settings-section">
            <div className="field-row">
              <Field
                label="公开邮箱"
                type="email"
                value={content.contact.email}
                onChange={(v) => set("contact.email", v)}
              />
              <Field
                label="公开地址"
                value={content.contact.address}
                onChange={(v) => set("contact.address", v)}
              />
            </div>
            <h3>社交链接</h3>
            {content.contact.links.map((link: any, i: number) => (
              <div className="content-block" key={i}>
                <div className="field-row">
                  <Field
                    label={`链接名称 ${i + 1}`}
                    value={link.label}
                    onChange={(v) => set(`contact.links.${i}.label`, v)}
                  />
                  <Field
                    label={`HTTPS链接 ${i + 1}`}
                    type="url"
                    value={link.url}
                    onChange={(v) => set(`contact.links.${i}.url`, v)}
                  />
                </div>
                <button
                  onClick={() =>
                    set(
                      "contact.links",
                      content.contact.links.filter(
                        (_: unknown, j: number) => i !== j,
                      ),
                    )
                  }
                >
                  移除链接
                </button>
              </div>
            ))}
            <button
              className="button secondary"
              disabled={content.contact.links.length >= 5}
              onClick={() =>
                set("contact.links", [
                  ...content.contact.links,
                  { label: "", url: "" },
                ])
              }
            >
              添加社交链接
            </button>
          </div>
          <Uploads
            onAsset={(a) =>
              setAssets((old) => [a, ...old.filter((x) => x.id !== a.id)])
            }
          />
        </div>
        <div className="panel">
          <h2>首页模块</h2>
          <section className="settings-section">
            {sectionTitle("hero", "H01 首屏作品展开", true)}
            <Field
              label="首屏标题"
              value={h.hero.title}
              multiline
              onChange={(v) => set("homepage.hero.title", v)}
            />
            <Field
              label="首屏说明"
              value={h.hero.description}
              onChange={(v) => set("homepage.hero.description", v)}
            />
            {picker("hero", "workIds", "首屏作品", 8)}
          </section>
          <section className="settings-section">
            {sectionTitle("featured", "H02 阶梯式精选作品", true)}
            <Field
              label="精选标题"
              value={h.featured.title}
              onChange={(v) => set("homepage.featured.title", v)}
            />
            <Field
              label="精选说明"
              value={h.featured.description}
              onChange={(v) => set("homepage.featured.description", v)}
            />
            {picker("featured", "workIds", "精选作品", 5)}
          </section>
          <section className="settings-section">
            {sectionTitle("banner", "H03 品牌视觉与合作标志")}
            <AssetSelector
              label="品牌横幅图片"
              assets={assets}
              value={h.banner.assetId}
              onChange={(v) => set("homepage.banner.assetId", v)}
            />
            {point("桌面横幅", "homepage.banner.desktopFocal")}
            {point("手机横幅", "homepage.banner.mobileFocal")}
            <label className="field">
              横幅链接作品
              <select
                value={h.banner.linkedWorkId || ""}
                onChange={(e) =>
                  set("homepage.banner.linkedWorkId", e.target.value || null)
                }
              >
                <option value="">无链接</option>
                {workOptions.map((w) => (
                  <option value={w.id} key={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <h3>合作标志</h3>
            {h.banner.logos.map((logo: any, i: number) => (
              <div className="content-block" key={i}>
                <AssetSelector
                  label={`合作标志 ${i + 1}`}
                  assets={assets}
                  value={logo.assetId}
                  onChange={(v) => set(`homepage.banner.logos.${i}.assetId`, v)}
                />
                <Field
                  label={`标志链接 ${i + 1}（选填HTTPS）`}
                  value={logo.url || ""}
                  onChange={(v) => set(`homepage.banner.logos.${i}.url`, v)}
                />
                <button
                  onClick={() =>
                    set(
                      "homepage.banner.logos",
                      h.banner.logos.filter((_: unknown, j: number) => j !== i),
                    )
                  }
                >
                  删除标志
                </button>
                <button
                  disabled={!i}
                  onClick={() => {
                    const list = [...h.banner.logos];
                    [list[i], list[i - 1]] = [list[i - 1], list[i]];
                    set("homepage.banner.logos", list);
                  }}
                >
                  上移标志
                </button>
              </div>
            ))}
            <button
              className="button secondary"
              disabled={h.banner.logos.length >= 12}
              onClick={() =>
                set("homepage.banner.logos", [
                  ...h.banner.logos,
                  { assetId: null, url: "" },
                ])
              }
            >
              添加合作标志
            </button>
          </section>
          <section className="settings-section">
            {sectionTitle("statement", "H04 品牌主张")}
            <Field
              label="品牌主张文字"
              value={h.statement.text}
              multiline
              onChange={(v) => set("homepage.statement.text", v)}
            />
            {picker("statement", "decorationWorkIds", "主张装饰作品", 3)}
          </section>
          <section className="settings-section">
            {sectionTitle("categories", "H05 文件夹式作品分类")}
            <OrderedPicker
              label="首页分类"
              value={h.categories.categoryIds || []}
              onChange={(v) => set("homepage.categories.categoryIds", v)}
              options={categories.map((c) => ({ id: c.id, name: c.name }))}
              limit={4}
            />
          </section>
          <section className="settings-section">
            {sectionTitle("gallery", "H06 双排作品画廊")}
            {picker("gallery", "workIds", "画廊作品", 16)}
          </section>
          <section className="settings-section">
            {sectionTitle("cases", "H07 案例故事")}
            <OrderedPicker
              label="案例作品"
              value={h.cases.items.map((c: any) => c.workId)}
              onChange={(v) =>
                set(
                  "homepage.cases.items",
                  v.map(
                    (id) =>
                      h.cases.items.find((c: any) => c.workId === id) || {
                        workId: id,
                        summaryOverride: "",
                      },
                  ),
                )
              }
              options={workOptions}
              limit={3}
            />
            {h.cases.items.map((item: any, i: number) => (
              <Field
                key={item.workId}
                label={`案例摘要 ${i + 1}`}
                value={item.summaryOverride}
                multiline
                onChange={(v) =>
                  set(`homepage.cases.items.${i}.summaryOverride`, v)
                }
              />
            ))}
          </section>
          <section className="settings-section">
            {sectionTitle("capabilities", "H08 服务或能力")}
            {h.capabilities.items.map((item: any, i: number) => (
              <div className="content-block" key={i}>
                <Field
                  label={`能力标题 ${i + 1}`}
                  value={item.title}
                  onChange={(v) =>
                    set(`homepage.capabilities.items.${i}.title`, v)
                  }
                />
                <Field
                  label={`能力说明 ${i + 1}`}
                  value={item.description}
                  multiline
                  onChange={(v) =>
                    set(`homepage.capabilities.items.${i}.description`, v)
                  }
                />
                <button
                  onClick={() =>
                    set(
                      "homepage.capabilities.items",
                      h.capabilities.items.filter(
                        (_: unknown, j: number) => i !== j,
                      ),
                    )
                  }
                >
                  移除能力
                </button>
                <button
                  disabled={!i}
                  onClick={() => {
                    const list = [...h.capabilities.items];
                    [list[i], list[i - 1]] = [list[i - 1], list[i]];
                    set("homepage.capabilities.items", list);
                  }}
                >
                  上移能力
                </button>
              </div>
            ))}
            <button
              className="button secondary"
              disabled={h.capabilities.items.length >= 3}
              onClick={() =>
                set("homepage.capabilities.items", [
                  ...h.capabilities.items,
                  { title: "", description: "" },
                ])
              }
            >
              添加能力
            </button>
          </section>
          <section className="settings-section">
            {sectionTitle("closing", "H09 联系收尾", true)}
            <Field
              label="联系收尾标题"
              value={h.closing.title}
              multiline
              onChange={(v) => set("homepage.closing.title", v)}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={h.closing.showDecoration}
                onChange={(e) =>
                  set("homepage.closing.showDecoration", e.target.checked)
                }
              />
              显示装饰图标
            </label>
            <fieldset className="icon-choices">
              <legend>装饰图标</legend>
              {decorationIcons.map((icon) => (
                <label className="check" key={icon.key}>
                  <input
                    type="checkbox"
                    checked={(h.closing.iconKeys || []).includes(icon.key)}
                    onChange={(e) =>
                      set(
                        "homepage.closing.iconKeys",
                        e.target.checked
                          ? [...(h.closing.iconKeys || []), icon.key]
                          : (h.closing.iconKeys || []).filter(
                              (key: string) => key !== icon.key,
                            ),
                      )
                    }
                  />
                  <span aria-hidden>{icon.glyph}</span>
                  {icon.label}
                </label>
              ))}
            </fieldset>
          </section>
        </div>
      </fieldset>
    </>
  );
}
