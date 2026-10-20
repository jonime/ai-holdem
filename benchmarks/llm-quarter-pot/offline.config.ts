import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({test:{include:["benchmarks/llm-quarter-pot/*.test.ts"]},resolve:{alias:{"@":fileURLToPath(new URL("../../",import.meta.url)),"server-only":fileURLToPath(new URL("../../test/server-only.ts",import.meta.url))}}});
