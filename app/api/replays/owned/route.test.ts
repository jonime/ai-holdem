import { beforeEach, expect, it, vi } from "vitest";
const { list, revoke, log } = vi.hoisted(() => ({ list: vi.fn(), revoke: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/poker/owned-shares", () => ({ listOwnedShares: list, revokeOwnedShare: revoke }));
vi.mock("@/lib/logging/application-failure", () => ({ logApplicationFailure: log, classifyApplicationFailure: () => "unexpected" }));
import { GET } from "./route";
import { DELETE } from "./[token]/route";
const token = "a".repeat(64);
const context = { params: Promise.resolve({ token }) };
beforeEach(() => { vi.clearAllMocks(); list.mockResolvedValue({ shares: [], nextCursor: null }); revoke.mockResolvedValue({ revoked: true }); });
it("uses cookies only, privately handles missing identities and rejects unknown fields", async () => {
  const result = await GET(new Request("https://holdem.test/api/replays/owned"));
  expect(list).toHaveBeenCalledWith(null, {});
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(result.headers.get("referrer-policy")).toBe("no-referrer");
  for (const query of ["owner=other", "beforeToken="+token, "beforeToken="+token+"&beforeToken="+token]) {
    expect((await GET(new Request(`https://holdem.test/api/replays/owned?${query}`))).status).toBe(400);
  }
});
it("validates response privacy and logs only a sanitized operation on failure", async () => {
  list.mockResolvedValue({ shares: [{ token, handNumber: 1, createdAt: "2026-10-01T00:00:00Z", expiresAt: "2026-11-01T00:00:00Z", snapshot: { secret: true } }], nextCursor: null });
  const result = await GET(new Request("https://holdem.test/api/replays/owned"));
  expect(result.status).toBe(500);
  expect(JSON.stringify(await result.json())).not.toContain("secret");
  expect(log).toHaveBeenCalledWith({ operation: "replay_share", category: "unexpected", status: 500 });
});
it("rejects cross-origin deletes before data access and revokes the exact path token with cookie ownership", async () => {
  for (const headers of [{} as Record<string, string>, { origin: "https://other.test" }, { origin: "https://holdem.test", "sec-fetch-site": "cross-site" }]) {
    expect((await DELETE(new Request("https://holdem.test/api/replays/owned/"+token, { method: "DELETE", headers }), context)).status).toBe(403);
  }
  expect(revoke).not.toHaveBeenCalled();
  const response = await DELETE(new Request("https://holdem.test/api/replays/owned/"+token+"?owner=attacker", { method: "DELETE", headers: { origin: "https://holdem.test", cookie: "ai-holdem-player-id=owner" } }), context);
  expect(revoke).toHaveBeenCalledWith("owner", token);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ revoked: true });
});
