import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  images: {
    imageSizes: [32, 48, 64, 96, 128, 256, 384, 540],
  },
  experimental: {
    cssChunking: "graph",
  },
};

export default nextConfig;
