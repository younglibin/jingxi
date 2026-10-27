import { serverRequest, getSite } from "@/lib/server";
import { SiteHeader, SiteFooter, WorkDetail } from "@/components/public-site";
import type { Detail } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revision?: string }>;
}) {
  const { id } = await params,
    { revision } = await searchParams;
  let work: Detail;
  try {
    work = await serverRequest<Detail>(
      `/api/admin/v1/previews/works/${encodeURIComponent(id)}?revision=${encodeURIComponent(revision || "")}`,
      true,
    );
  } catch {
    return (
      <main className="container empty">
        <h1>预览暂不可用</h1>
        <p>请登录并保存当前版本后重新预览。旧版本链接不会显示其他草稿内容。</p>
        <a className="button" href={`/admin/works/${id}`}>
          返回编辑
        </a>
      </main>
    );
  }
  const site = await getSite();
  return (
    <>
      <div className="preview-bar">
        受保护的作品草稿预览 · 版本 {revision}
        <a href={`/admin/works/${id}`}>返回编辑</a>
      </div>
      <SiteHeader site={site} />
      <WorkDetail work={work} />
      <SiteFooter site={site} />
    </>
  );
}
