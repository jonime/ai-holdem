import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  cacheComponents: true,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  images: {
    imageSizes: [32, 48, 64, 96, 128, 256, 384, 540],
  },
  experimental: {
    cssChunking: "graph",
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
