import { defineConfig } from "vitest/config";
import applicationConfig from "./vitest.config";

// Harness/evidence regression tests, separate from full benchmark evaluations.
export default defineConfig({
  ...applicationConfig,
  test: {
    ...applicationConfig.test,
    include: ["benchmarks/**/*.test.{ts,tsx,js,jsx}"],
    exclude: ["node_modules/**"],
  },
});
