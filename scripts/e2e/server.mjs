import { resolve } from "node:path";
import { run } from "./process.mjs";
if (!process.env.E2E_WORKSPACE) throw new Error("Use npm run test:e2e:smoke to build the production server first.");
if (process.env.EXTERNAL_INFERENCE_ENABLED !== "false" || process.env.TYPESAFE_API_KEY || process.env.LLM_API_KEY || process.env.LLM_API_ENDPOINT) throw new Error("Production smoke must disable external inference and clear provider credentials.");
console.log("Starting production Next.js on port 3002 with external inference disabled.");
await run(process.execPath, [resolve(process.env.E2E_WORKSPACE, "node_modules/next/dist/bin/next"), "start", "--port", "3002"], {
  cwd: process.env.E2E_WORKSPACE, phase: "application", timeout: 600_000, gracefulStop: true,
});
