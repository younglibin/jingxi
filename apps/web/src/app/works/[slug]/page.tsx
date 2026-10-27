import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getSite, serverRequest } from "@/lib/server";
import type { Detail } from "@/lib/types";
import {
  SiteHeader,
  SiteFooter,
  WorkDetail,
  SiteLoadFailure,
} from "@/components/public-site";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await getSite();
  let work: Detail;
  try {
    work = await serverRequest<Detail>(
      `/api/public/v1/works/${encodeURIComponent(slug)}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <>
        <SiteHeader site={site} />
        <SiteLoadFailure retryHref={`/works/${encodeURIComponent(slug)}`} />
        <SiteFooter site={site} />
      </>
    );
  }
  return (
    <>
      <SiteHeader site={site} />
      <WorkDetail work={work} />
      <SiteFooter site={site} />
    </>
  );
}
