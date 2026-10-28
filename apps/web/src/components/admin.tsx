"use client";
import { useEffect, useRef, useState } from "react";
import type { Work, Category, Asset } from "@/lib/types";
import { request, login, errorMessage, ApiError } from "@/lib/api";
import { CheckField, Field, FieldHelp, SaveForm, SelectField } from "./fields";
import { adminHelp } from "@/lib/admin-help";
import { WorkEditor } from "./work-editor";
import { SettingsEditor, type SiteConfig } from "./settings-editor";
export function AdminShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<{ username: string } | null>(null),
    [error, setError] = useState(""),
    [path, setPath] = useState("");
  useEffect(() => {
    setPath(location.pathname);
    request<{ username: string }>("/api/auth/session")
      .then(setSession)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  if (error)
    return (
      <main className="login-page">
        <div className="login-card">
          <h1>请先登录</h1>
          <p className="error">{error}</p>
          <a className="button" href="/admin/login">
            前往登录
          </a>
        </div>
      </main>
    );
  if (!session)
    return (
      <main className="login-page">
        <p role="status">正在验证会话…</p>
      </main>
    );
  return (
    <div className="admin-shell">
      <header className="admin-top">
        <a href="/admin/works" className="wordmark">
          内容管理
        </a>
        <div>
          <a href="/" target="_blank" rel="noopener noreferrer">
            查看网站 ↗
          </a>
          <span>{session.username}</span>
          <button
            onClick={async () => {
              try {
                await request("/api/auth/logout", { method: "POST" });
                location.assign("/admin/login");
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            退出
          </button>
        </div>
      </header>
      <div className="admin-body">
        <nav className="admin-sidebar" aria-label="管理导航">
          {[
            ["/admin/works", "作品管理"],
            ["/admin/settings", "网站设置"],
            ["/admin/categories", "分类维护"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className={path.startsWith(href) ? "active" : ""}
            >
              {label}
            </a>
          ))}
          <p className="small muted">仅维护者可见</p>
        </nav>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
export function LoginForm() {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="login-page">
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            await login(username, password);
            location.assign("/admin/works");
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <a href="/" className="wordmark">
          未命名工作室 / 内容管理
        </a>
        <h1>欢迎回来。</h1>
        <p className="muted">登录以管理作品与网站内容。</p>
        <Field
          label="用户名"
          help={adminHelp.admin.username}
          value={username}
          onChange={setUsername}
        />
        <Field
          label="密码"
          help={adminHelp.admin.password}
          type="password"
          value={password}
          onChange={setPassword}
        />
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="button" disabled={busy || !username || !password}>
          {busy ? "正在登录…" : "登录管理后台"}
        </button>
        <p className="muted small" style={{ marginTop: 24 }}>
          账号由部署者配置，无默认密码。
        </p>
      </form>
    </main>
  );
}
async function allWorks(state = "") {
  const items: Work[] = [];
  let page = 1,
    total = 1;
  while (items.length < total) {
    const result = await request<{ items: Work[]; total: number }>(
      `/api/admin/v1/works?state=${state}&page=${page}`,
    );
    items.push(...result.items);
    total = result.total;
    if (!result.items.length) break;
    page++;
  }
  return items;
}
export function WorksAdmin() {
  const [items, setItems] = useState<Work[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [q, setQ] = useState(""),
    [state, setState] = useState(""),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0),
    [order, setOrder] = useState<{
      workIds: string[];
      catalogRevision: number;
    } | null>(null),
    [orderTitles, setOrderTitles] = useState<Record<string, string>>({});
  const serial = useRef(0);
  useEffect(() => {
    request<{ items: Category[] }>("/api/admin/v1/categories")
      .then((r) => setCategories(r.items))
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    const n = ++serial.current;
    setBusy(true);
    request<{ items: Work[]; total: number }>(
      `/api/admin/v1/works?${new URLSearchParams({ q, state, categoryId: category, page: String(page) })}`,
    )
      .then((r) => {
        if (n === serial.current) {
          setItems(r.items);
          setTotal(r.total);
        }
      })
      .catch((e) => {
        if (n === serial.current) setError(errorMessage(e));
      })
      .finally(() => {
        if (n === serial.current) setBusy(false);
      });
  }, [q, state, category, page, tick]);
  const action = async (w: Work, kind: string) => {
    setBusy(true);
    setError("");
    try {
      await request(`/api/admin/v1/works/${w.id}/${kind}`, {
        method: "POST",
        body: JSON.stringify({ expectedStateRevision: w.stateRevision }),
      });
      setTick((t) => t + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="section-heading">
        <div>
          <h1>作品管理</h1>
          <p className="muted">维护内容、发布状态和作品顺序。</p>
        </div>
        <div className="actions">
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              try {
                const w = await request<Work>("/api/admin/v1/works", {
                  method: "POST",
                  body: "{}",
                });
                location.assign(`/admin/works/${w.id}`);
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            新建作品
          </button>
          <button
            className="button secondary"
            onClick={async () => {
              try {
                const [o, all] = await Promise.all([
                  request<{ workIds: string[]; catalogRevision: number }>(
                    "/api/admin/v1/work-order",
                  ),
                  allWorks("published"),
                ]);
                setOrder(o);
                setOrderTitles(
                  Object.fromEntries(
                    all.map((w) => [
                      w.id,
                      w.published?.content.title || w.draft.content.title,
                    ]),
                  ),
                );
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            全局作品排序
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {order && (
        <section className="panel">
          <h2>完整公开作品顺序</h2>
          <FieldHelp>{adminHelp.admin.order}</FieldHelp>
          <ol className="order-list">
            {order.workIds.map((id, i) => (
              <li key={id}>
                <span>
                  {i + 1}. {orderTitles[id] || id}
                </span>
                <button
                  disabled={!i}
                  onClick={() => {
                    const ids = [...order.workIds];
                    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                    setOrder({ ...order, workIds: ids });
                  }}
                >
                  上移
                </button>
                <button
                  disabled={i === order.workIds.length - 1}
                  onClick={() => {
                    const ids = [...order.workIds];
                    [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                    setOrder({ ...order, workIds: ids });
                  }}
                >
                  下移
                </button>
              </li>
            ))}
          </ol>
          <div className="actions">
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await request("/api/admin/v1/work-order", {
                    method: "PUT",
                    body: JSON.stringify({
                      workIds: order.workIds,
                      expectedCatalogRevision: order.catalogRevision,
                    }),
                  });
                  setOrder(null);
                  setTick((t) => t + 1);
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              保存完整排序
            </button>
            <button className="button secondary" onClick={() => setOrder(null)}>
              取消排序
            </button>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="toolbar">
          <Field
            label="搜索作品"
            help={adminHelp.admin.search}
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
          />
          <SelectField
            label="分类"
            help={adminHelp.admin.filterCategory}
            value={category}
            onChange={(value) => {
              setCategory(value);
              setPage(1);
            }}
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="作品状态"
            help={adminHelp.admin.filterState}
            value={state}
            onChange={(value) => {
              setState(value);
              setPage(1);
            }}
          >
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
            <option value="unpublished">已下架</option>
            <option value="recycled">回收站</option>
          </SelectField>
        </div>
        <div className="table-wrap" aria-busy={busy}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>作品名称</th>
                <th>分类</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((w) => (
                <tr key={w.id}>
                  <td>
                    <a href={`/admin/works/${w.id}`}>
                      {w.draft.content.title || "未命名作品"}
                    </a>
                  </td>
                  <td>
                    {categories.find((c) => c.id === w.draft.content.categoryId)
                      ?.name || "其他"}
                  </td>
                  <td>
                    <span className="badge">
                      {w.recycledAt
                        ? "回收站"
                        : w.visible
                          ? "已发布"
                          : w.published
                            ? "已下架"
                            : "草稿"}
                    </span>
                    {w.published &&
                      w.published.sourceDraftRevision !== w.draftRevision && (
                        <p className="small muted">有未发布修改</p>
                      )}
                  </td>
                  <td>
                    {w.updatedAt
                      ? new Date(w.updatedAt).toLocaleDateString("zh-CN")
                      : "—"}
                  </td>
                  <td>
                    {w.recycledAt ? (
                      <button
                        disabled={busy}
                        onClick={() => action(w, "restore")}
                      >
                        恢复作品
                      </button>
                    ) : (
                      <>
                        <a href={`/admin/works/${w.id}`}>编辑</a>　
                        {w.visible && (
                          <button
                            disabled={busy}
                            onClick={() => action(w, "unpublish")}
                          >
                            下架
                          </button>
                        )}
                        　
                        <button
                          disabled={busy}
                          onClick={() => action(w, "recycle")}
                        >
                          移入回收站
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && !busy && (
          <p className="empty muted">暂无符合条件的作品。</p>
        )}
        <div className="pagination">
          <button
            disabled={busy || page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </button>
          <span>
            第{page}页 / 共{total}件
          </span>
          <button
            disabled={busy || page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      </section>
    </>
  );
}
export function AdminWorkLoader({ id }: { id: string }) {
  const [data, setData] = useState<{
      work: Work;
      categories: Category[];
      assets: Asset[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      request<Work>(`/api/admin/v1/works/${id}`),
      request<{ items: Category[] }>("/api/admin/v1/categories"),
      request<{ items: Asset[] }>("/api/admin/v1/assets"),
    ])
      .then(([work, categories, assets]) =>
        setData({ work, categories: categories.items, assets: assets.items }),
      )
      .catch((e) => setError(errorMessage(e)));
  }, [id]);
  return error ? (
    <p role="alert" className="error">
      {error}
    </p>
  ) : data ? (
    <WorkEditor
      initial={data.work}
      categories={data.categories}
      assets={data.assets}
    />
  ) : (
    <p role="status">正在读取作品…</p>
  );
}
export function AdminSettingsLoader() {
  const [data, setData] = useState<{
      site: SiteConfig;
      works: Work[];
      categories: Category[];
      assets: Asset[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      request<SiteConfig>("/api/admin/v1/site/draft"),
      allWorks("published"),
      request<{ items: Category[] }>("/api/admin/v1/categories"),
      request<{ items: Asset[] }>("/api/admin/v1/assets"),
    ])
      .then(([site, works, categories, assets]) =>
        setData({
          site,
          works,
          categories: categories.items,
          assets: assets.items,
        }),
      )
      .catch((e) => setError(errorMessage(e)));
  }, []);
  return error ? (
    <p role="alert" className="error">
      {error}
    </p>
  ) : data ? (
    <SettingsEditor
      initial={data.site}
      works={data.works}
      categories={data.categories}
      assets={data.assets}
    />
  ) : (
    <p role="status">正在读取网站配置…</p>
  );
}
export function CategoriesAdmin() {
  const [categories, setCategories] = useState<Category[]>([]),
    [error, setError] = useState(""),
    [name, setName] = useState(""),
    [slug, setSlug] = useState(""),
    [tick, setTick] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    request<{ items: Category[] }>("/api/admin/v1/categories")
      .then((r) => setCategories(r.items))
      .catch((e) => setError(errorMessage(e)));
  }, [tick]);
  return (
    <>
      <h1>分类维护</h1>
      <p className="muted">
        分类修改直接生效。有关联内容的分类需先迁移，系统分类不可停用或删除。
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <section className="panel">
        <h2>新建分类</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await request("/api/admin/v1/categories", {
                method: "POST",
                body: JSON.stringify({ name, slug }),
              });
              setName("");
              setSlug("");
              setTick((t) => t + 1);
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="field-row">
            <Field
              label="分类名称"
              help={adminHelp.category.name}
              value={name}
              onChange={setName}
            />
            <Field
              label="分类访问标识（创建后固定）"
              help={adminHelp.category.slug}
              value={slug}
              onChange={setSlug}
            />
          </div>
          <button
            className="button"
            disabled={busy || !name.trim() || !slug.trim()}
          >
            新建分类
          </button>
        </form>
      </section>
      <section className="panel">
        {categories.map((c) => (
          <CategoryEditor
            key={`${c.id}-${c.revision}`}
            category={c}
            categories={categories}
            onUpdated={() => setTick((t) => t + 1)}
          />
        ))}
      </section>
    </>
  );
}
function CategoryEditor({
  category: c,
  categories,
  onUpdated,
}: {
  category: Category;
  categories: Category[];
  onUpdated: () => void;
}) {
  const [enabled, setEnabled] = useState(c.enabled),
    [order, setOrder] = useState(c.sortOrder),
    [target, setTarget] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="category-item">
      <SaveForm
        label={`分类名称：${c.slug}`}
        help={
          c.system
            ? "系统“其他”分类用于承接未指定分类的作品，名称固定，保持启用。"
            : adminHelp.category.name
        }
        initial={c.name}
        onSave={async (name) => {
          await request(`/api/admin/v1/categories/${c.id}`, {
            method: "PUT",
            body: JSON.stringify({
              expectedRevision: c.revision,
              name,
              enabled,
              sortOrder: order,
            }),
          });
          onUpdated();
        }}
      >
        <div className="field-row">
          <Field
            label="显示顺序"
            help={adminHelp.category.order}
            type="number"
            value={order}
            onChange={(v) => setOrder(Number(v))}
          />
          <CheckField
            label={`启用分类${c.system ? "（系统分类）" : ""}`}
            help={adminHelp.category.enabled}
            disabled={c.system}
            checked={enabled}
            onChange={setEnabled}
          />
        </div>
        <p className="small muted">
          草稿引用 {c.draftReferenceCount || 0} / 公开引用{" "}
          {c.publishedReferenceCount || 0} / 配置引用{" "}
          {c.siteReferenceCount || 0}
        </p>
        <FieldHelp>{adminHelp.category.references}</FieldHelp>
      </SaveForm>
      {!c.system && (
        <>
          <div className="actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await request(
                    `/api/admin/v1/categories/${c.id}?expectedRevision=${c.revision}`,
                    { method: "DELETE" },
                  );
                  onUpdated();
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              删除分类
            </button>
          </div>
          <div className="selector">
            <select
              aria-label={`迁移${c.name}至分类`}
              aria-describedby={`category-migration-${c.id}`}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">选择迁移目标</option>
              {categories
                .filter((x) => x.id !== c.id && x.enabled)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
            <button
              className="button secondary"
              disabled={!target || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const [active, recycled] = await Promise.all([
                    allWorks(),
                    allWorks("recycled"),
                  ]);
                  const seen = new Set<string>();
                  const works = [...active, ...recycled]
                    .filter(
                      (w) =>
                        w.draft.content.categoryId === c.id &&
                        !seen.has(w.id) &&
                        seen.add(w.id),
                    )
                    .map((w) => ({
                      id: w.id,
                      expectedDraftRevision: w.draftRevision,
                    }));
                  await request(`/api/admin/v1/categories/${c.id}/migrate`, {
                    method: "POST",
                    body: JSON.stringify({ targetCategoryId: target, works }),
                  });
                  onUpdated();
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              迁移关联草稿
            </button>
          </div>
          <FieldHelp id={`category-migration-${c.id}`}>
            {adminHelp.category.migration}
          </FieldHelp>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
