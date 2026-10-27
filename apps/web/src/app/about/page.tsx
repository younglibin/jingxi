import { getSite } from "@/lib/server";
import { SiteHeader, SiteFooter, About } from "@/components/public-site";
export const dynamic = "force-dynamic";
export default async function Page() {
  const site = await getSite();
  return (
    <>
      <SiteHeader site={site} />
      <About site={site} />
      <SiteFooter site={site} />
    </>
  );
}
