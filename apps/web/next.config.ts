import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const webRoot = dirname(fileURLToPath(import.meta.url));
const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: webRoot,
  turbopack: { root: webRoot },
  async rewrites() {
    const api = process.env.API_INTERNAL_URL || "http://127.0.0.1:8081";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/media/:path*", destination: `${api}/media/:path*` },
    ];
  },
};
export default config;
