import { resolve } from "node:path";
import { run } from "./process.mjs";
if (!process.env.E2E_WORKSPACE) throw new Error("Use npm run test:e2e:smoke to build the production server first.");
await run(process.execPath, [resolve(process.env.E2E_WORKSPACE, "node_modules/next/dist/bin/next"), "start", "--port", "3002"], {
  cwd: process.env.E2E_WORKSPACE, phase: "application", timeout: 600_000, gracefulStop: true,
});
