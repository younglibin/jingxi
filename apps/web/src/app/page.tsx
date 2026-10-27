import { getSite } from "@/lib/server";
import { Home, SiteHeader, SiteFooter } from "@/components/public-site";
export const dynamic = "force-dynamic";
export default async function Page() {
  const site = await getSite();
  return (
    <>
      <SiteHeader site={site} />
      <Home site={site} />
      <SiteFooter site={site} />
    </>
  );
}
