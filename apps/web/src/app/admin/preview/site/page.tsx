import { serverRequest } from "@/lib/server";
import { Home, SiteHeader, SiteFooter } from "@/components/public-site";
import type { PublicSite } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ revision?: string }>;
}) {
  const { revision } = await searchParams;
  let site: PublicSite;
  try {
    site = await serverRequest<PublicSite>(
      `/api/admin/v1/previews/site?revision=${encodeURIComponent(revision || "")}`,
      true,
    );
  } catch {
    return (
      <main className="container empty">
        <h1>预览暂不可用</h1>
        <p>请登录并保存当前网站配置后重新预览。</p>
        <a className="button" href="/admin/settings">
          返回网站设置
        </a>
      </main>
    );
  }
  return (
    <>
      <div className="preview-bar">
        受保护的网站配置预览 · 作品引用当前公开版
        <a href="/admin/settings">返回设置</a>
      </div>
      <SiteHeader site={site} />
      <Home site={site} />
      <SiteFooter site={site} />
    </>
  );
}
