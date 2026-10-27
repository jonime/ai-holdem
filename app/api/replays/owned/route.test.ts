import { beforeEach, expect, it, vi } from "vitest";
const { list, revoke, edit, log } = vi.hoisted(() => ({ list: vi.fn(), revoke: vi.fn(), edit: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/poker/owned-shares", () => ({ listOwnedShares: list, revokeOwnedShare: revoke, editOwnedShareTitle: edit }));
vi.mock("@/lib/logging/application-failure", () => ({ logApplicationFailure: log, classifyApplicationFailure: () => "unexpected" }));
import { GET } from "./route";
import { ShareOutcome } from "@/lib/poker/replay-sharing";
import { DELETE, PATCH } from "./[token]/route";
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

it("validates exact-token title PATCH and cookie ownership before edits", async () => {
  const request = (body: unknown, origin = "https://holdem.test") => new Request("https://holdem.test/api/replays/owned/"+token, { method: "PATCH", headers: { origin, cookie: "ai-holdem-player-id=owner" }, body: JSON.stringify(body) });
  expect((await PATCH(request({ title: "Title", titleRevision: 0 }, "https://foreign.test"), context)).status).toBe(403);
  for (const body of [{ title: "x" }, { title: "x\ny", titleRevision: 0 }, { title: "x", titleRevision: -1 }, { title: "x", titleRevision: 0, owner: "attacker" }]) {
    expect((await PATCH(request(body), context)).status).toBe(400);
  }
  expect(edit).not.toHaveBeenCalled();
  const result = { token, title: null, titleRevision: 3, expiresAt: "2099-01-01T00:00:00Z" };
  edit.mockResolvedValueOnce(result);
  const response = await PATCH(request({ title: null, titleRevision: 2 }), context);
  expect(await response.json()).toEqual(result);
  expect(edit).toHaveBeenCalledWith("owner", token, { title: null, titleRevision: 2 });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  edit.mockRejectedValueOnce(new ShareOutcome("SHARE_CONFLICT"));
  expect((await PATCH(request({ title: "Old", titleRevision: 2 }), context)).status).toBe(409);
  edit.mockRejectedValueOnce(new ShareOutcome("SHARE_FORBIDDEN"));
  expect((await PATCH(request({ title: "Old", titleRevision: 2 }), context)).status).toBe(403);
});
