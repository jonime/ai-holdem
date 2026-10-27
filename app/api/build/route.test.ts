import { expect, it, vi } from "vitest";
import { GET } from "./route";

it("exposes only the existing build identifier with no caching", async () => {
  vi.stubEnv("APP_BUILD_IDENTIFIER", "a".repeat(40));
  try {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ build: "a".repeat(40) });
  } finally { vi.unstubAllEnvs(); }
});
