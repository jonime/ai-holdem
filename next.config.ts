import type { NextConfig } from "next";
import { buildIdentifier } from "./lib/build-identifier";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  cacheComponents: true,
  env: { APP_BUILD_IDENTIFIER: buildIdentifier(process.env.VERCEL_GIT_COMMIT_SHA) },
  async headers() {
    return ["/replay/:path*", "/:lang/replay/:path*", "/api/replays/:path*"].map(source => ({ source, headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ] }));
  },
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  images: {
    imageSizes: [32, 48, 64, 96, 128, 256, 384, 540],
  },
  experimental: {
    globalNotFound: true,
    cssChunking: "graph",
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
