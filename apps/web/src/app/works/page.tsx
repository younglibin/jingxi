import { getSite } from "@/lib/server";
import { SiteHeader, SiteFooter } from "@/components/public-site";
import { WorkBrowser } from "@/components/work-browser";
export const dynamic = "force-dynamic";
export default async function Page() {
  const site = await getSite();
  return (
    <>
      <SiteHeader site={site} />
      <main className="container works-page">
        <p className="eyebrow">作品 / SELECTED WORKS</p>
        <h1>
          用作品，
          <br />
          认真表达。
        </h1>
        <WorkBrowser />
      </main>
      <SiteFooter site={site} />
    </>
  );
}
