import { beforeEach, describe, expect, it, vi } from "vitest";
const manage = vi.hoisted(() => vi.fn());
const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/poker/replay-sharing", async importOriginal => ({ ...await importOriginal<object>(), manageReplayShare: manage, readSharedReplay: read }));
import { GET, POST, DELETE } from "./[gameId]/hands/[handNumber]/share/route";
import { GET as view } from "../../api/replays/[token]/route";
import { ShareOutcome } from "@/lib/poker/replay-sharing";
const gameId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ gameId, handNumber: "1" }) };
const token = "a".repeat(64);
beforeEach(() => vi.clearAllMocks());
describe("share HTTP boundary", () => {
  it.each([POST, DELETE])("rejects cross-origin or missing-Origin mutations before ownership/data access", async method => {
    for (const origin of [undefined, "https://other.test"]) {
      const response = await method(new Request(`https://holdem.test/api/games/${gameId}/hands/1/share`, { method: method === POST ? "POST" : "DELETE", headers: origin ? { origin } : {} }), context);
      expect(response.status).toBe(403);
      expect(manage).not.toHaveBeenCalled();
    }
  });
  it("uses only the ownership cookie for management and validates an allowlisted response", async () => {
    manage.mockResolvedValue({ share: { token, expiresAt: "2026-11-17T12:00:00Z" } });
    const response = await GET(new Request("https://holdem.test/api/share", { headers: { cookie: "ai-holdem-player-id=owner" } }), context);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Object.keys(await response.json())).toEqual(["share"]);
    expect(manage.mock.calls[0].slice(1)).toEqual([gameId, 1, "owner", "read"]);
  });
  it("makes unknown, malformed, expired and revoked links indistinguishable", async () => {
    read.mockRejectedValue(new ShareOutcome("SHARE_UNAVAILABLE"));
    for (const value of [token, "b".repeat(64), "guess"]) {
      const response = await view(new Request(`https://holdem.test/api/replays/${value}`), { params: Promise.resolve({ token: value }) });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: "SHARE_UNAVAILABLE", error: "Replay unavailable" });
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
  });
});
