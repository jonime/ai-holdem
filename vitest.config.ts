import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Load before test collection so configured LLMs get their own test groups.
// Existing shell/CI variables take precedence; the file is optional.
const testEnvPath = fileURLToPath(new URL("./.env.test", import.meta.url));
if (existsSync(testEnvPath)) loadEnvFile(testEnvPath);

export default defineConfig({
  test: {
    include: ["**/*.test.{ts,tsx,js,jsx}"],
    exclude: ["node_modules/**", "test/e2e/**", ".next/**", "dist/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./test/server-only.ts", import.meta.url),
      ),
    },
  },
});
