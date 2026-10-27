import { cookies } from "next/headers";
import { ApiError } from "./api";
import { defaultSite } from "./default-site";
import type { PublicSite } from "./types";
export async function serverRequest<T>(
  path: string,
  authenticated = false,
): Promise<T> {
  const headers: HeadersInit = {};
  if (authenticated) headers.Cookie = (await cookies()).toString();
  const r = await fetch(
    `${process.env.API_INTERNAL_URL || "http://127.0.0.1:8081"}${path}`,
    { cache: "no-store", headers },
  );
  if (!r.ok) throw new ApiError(r.status, { message: "站点内容暂时无法加载" });
  return r.json();
}
export async function getSite(): Promise<PublicSite> {
  try {
    return await serverRequest<PublicSite>("/api/public/v1/site");
  } catch {
    return { ...defaultSite, loadError: "站点内容暂时无法加载" };
  }
}
