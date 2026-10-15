import { it, expect, vi } from "vitest";
import { offline, live } from "./runner";
it.skipIf(process.env.BOT_AUDIT_MODE === "live")("audits production rules and transformation mechanics without inference", async () => {
  process.env.EXTERNAL_INFERENCE_ENABLED="false";
  vi.stubGlobal("fetch",()=>{throw new Error("Offline network is forbidden");});
  try { const result=await offline(); expect(result.rows).toHaveLength(17811); } finally { vi.unstubAllGlobals(); }
},43_200_000);
it.skipIf(process.env.BOT_AUDIT_MODE !== "live")("runs the separately authorized frozen 972-decision audit",async()=>{
  const result=await live(); expect(result.rows).toHaveLength(972);
},43_200_000);
