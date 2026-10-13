import { afterEach, beforeEach, expect, it, vi } from "vitest";
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each(["access", "read"])("imports and creates Broadcast transport without storage %s", async failure => {
  const read = vi.fn(() => { throw Error("Unavailable"); });
  const browser = {};
  Object.defineProperty(browser, "localStorage", { get() {
    if (failure === "access") throw Error("Unavailable");
    return { getItem: read };
  } });
  vi.stubGlobal("window", browser);
  vi.stubGlobal("localStorage", { getItem: read });
  const { createSupabaseBrowserClient } = await import("./client");
  const client = createSupabaseBrowserClient();
  expect(client.endPoint).toBe("ws://127.0.0.1:54321/realtime/v1/websocket");
  expect(client.apiKey).toBe("public-test-key");
  expect(await client.accessToken!()).toBe("public-test-key");
  expect(createSupabaseBrowserClient()).toBe(client);
  expect(read).not.toHaveBeenCalled();
});
it("keeps missing public configuration visible", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  const { createSupabaseBrowserClient } = await import("./client");
  expect(createSupabaseBrowserClient).toThrow("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
});
