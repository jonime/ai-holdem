import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite must not load application environment files either.
  envDir: false,
  test: {
    include: ["test/integration/bot-pipeline/**/*.integration.ts"],
    setupFiles: ["test/integration/bot-pipeline/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 30_000,
    retry: 0,
    reporters: ["./test/integration/bot-pipeline/reporter.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
});
