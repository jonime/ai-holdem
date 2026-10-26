import { writeFileSync } from "node:fs";
import { test as base, expect, type BrowserContext, type APIRequestContext } from "@playwright/test";
import type { Game } from "../../components/poker/types";
import { cleanupTables } from "../../scripts/e2e/smoke-cleanup.mjs";

export { expect } from "@playwright/test";
export async function read(request: APIRequestContext, id: string): Promise<Game> {
  const response = await request.get(`/api/games/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).game;
}

export const test = base.extend<{ table: { id: string; guest: () => Promise<BrowserContext> } }>({
  table: async ({ page, browser }, runTest, info) => {
    const tables: { id: string; owner: APIRequestContext; guests: APIRequestContext[] }[] = [];
    const contexts: BrowserContext[] = [];
    try {
      const response = await page.request.post("/api/games", { data: { seatCount: 2, humanTurnSeconds: null, hostName: "Release smoke" } });
      expect(response.status()).toBe(201);
      const { gameId: id } = await response.json();
      if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid created table ID");
      const table = { id, owner: page.request, guests: [] as APIRequestContext[] };
      tables.push(table);
      await runTest({ id, guest: async () => {
        const context = await browser.newContext({ baseURL: info.project.use.baseURL });
        contexts.push(context);
        table.guests.push(context.request);
        return context;
      } });
    } finally {
      // Capture the failing UI before stopping browser activity for cleanup.
      let screenshot = 0;
      for (const context of [page.context(), ...contexts]) {
        for (const open of context.pages()) {
          if (info.status !== info.expectedStatus) {
            await open.screenshot({ path: info.outputPath(`journey-failure-${screenshot++}.png`) }).catch(() => undefined);
          }
          await open.goto("about:blank").catch(() => undefined);
        }
      }
      const failures = await cleanupTables(tables);
      for (const context of contexts) {
        try { await context.close(); } catch { failures.push("Browser context cleanup failed"); }
      }
      if (failures.length) {
        const message = failures.join("\n");
        console.error(message);
        writeFileSync(info.outputPath("cleanup-summary.txt"), message);
        await info.attach("cleanup-failures", { body: message, contentType: "text/plain" });
        if (info.status === info.expectedStatus) throw new Error(message);
      }
    }
  },
});
