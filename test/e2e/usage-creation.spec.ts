import { expect, test } from "@playwright/test";

test("shared creation allowance returns localized HTML and typed JSON denials", { tag: "@smoke" }, async ({ page }) => {
  // A new context owns only these fixtures; custom/mixed/rules admissions share one key.
  for (let i = 0; i < 6; i++) {
    const path = i % 3 === 0 ? "/api/games" : i % 3 === 1 ? "/fi-FI/new-game" : "/fi-FI/quick-game?botMode=rules";
    const response = await page.request.post(path, { headers: { Accept: "application/json" }, data: {} });
    expect([201, 200]).toContain(response.status());
  }
  const json = await page.request.post("/fi-FI/quick-game", { headers: { Accept: "application/json" } });
  expect(json.status()).toBe(429);
  expect(await json.json()).toMatchObject({ code: "GAME_CREATION_LIMIT" });
  expect(Number(json.headers()["retry-after"])).toBeGreaterThan(0);
  const html = await page.request.post("/fi-FI/quick-game?botMode=rules");
  expect(html.status()).toBe(429);
  expect(html.headers()["content-type"]).toContain("text/html");
  expect(await html.text()).toContain("Pelien luontia on rajoitettu");
  expect(await html.text()).toContain('href="/fi-FI"');
});
