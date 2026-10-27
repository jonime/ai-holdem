import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ rpc: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => ({ rpc: h.rpc }) }));
vi.mock("./shared-hand-title", () => ({ generateSharedHandTitle: h.generate }));
vi.mock("@/lib/usage/identity", () => ({ hashUsageIdentity: () => "a".repeat(64), creationIP: () => "127.0.0.1", localCreationIdentity: () => "local" }));
vi.mock("./hand-replay", () => ({ reconstructHandReplay: () => {
  const players = [0, 1].map(seat => ({ seat, cards: null, stack: 100, bet: 0, folded: true, allIn: false }));
  const frame = { kind: "start", street: "preflop", board: [], pot: 10, nextActorSeat: null, action: null, players };
  return { holdings: [{ id: "human", seat: 0, controller: "human", token: "owner", cards: ["As", "Kd"] }, { id: "other", seat: 1, controller: "human", token: "secret", cards: ["2h", "3h"] }],
    replay: { gameId: "source-id", handNumber: 88, dealerSeat: 0, smallBlindSeat: 0, bigBlindSeat: 1,
      participants: [{ seat: 0, name: "Owner name" }, { seat: 1, name: "Other name" }], pots: [], frames: [frame, { ...frame, kind: "result", street: "complete" }] } };
} }));
import { manageReplayShare, readSharedReplay } from "./replay-sharing";
const token = "b".repeat(64), share = { token, expiresAt: "2099-01-01T00:00:00Z", title: null, titleRevision: 0 };
const request = new Request("http://localhost/api/share");
beforeEach(() => { vi.clearAllMocks(); h.generate.mockResolvedValue("A factual public title"); });
function setup(eligible: boolean) {
  h.rpc.mockResolvedValueOnce({ data: {}, error: null }).mockResolvedValueOnce({ data: { share, generationEligible: eligible }, error: null });
}
it("only attempts generation for the insertion request using the exact sanitized snapshot and locale", async () => {
  setup(true); h.rpc.mockResolvedValueOnce({ data: true, error: null });
  const result = await manageReplayShare(request, "source-id", 88, "owner", "create", "fi-FI");
  expect(result.share?.title).toBe("A factual public title");
  const snapshot = h.generate.mock.calls[0][0];
  expect(h.generate.mock.calls[0][1]).toBe("fi-FI");
  expect(snapshot).toEqual(h.rpc.mock.calls[1][1].p_snapshot);
  expect(JSON.stringify(snapshot)).not.toMatch(/source-id|handNumber|secret|2h|3h/);
  expect(h.rpc.mock.calls[2]).toEqual(["commit_replay_share_title", { p_link_token: token, p_title: "A factual public title" }]);
  expect(result).not.toHaveProperty("generationEligible");
});
it.each(["create", "read"] as const)("does not generate from a duplicate or management %s", async operation => {
  setup(false); expect((await manageReplayShare(request, "source-id", 88, "owner", operation)).share).toEqual(share);
  expect(h.generate).not.toHaveBeenCalled();
});
it("returns successful sharing when the attempt fails or is interrupted; duplicate creation does not resume it", async () => {
  setup(true); h.generate.mockResolvedValueOnce(null);
  expect((await manageReplayShare(request, "source-id", 88, "owner", "create")).share).toEqual(share);
  setup(false); await manageReplayShare(request, "source-id", 88, "owner", "create");
  expect(h.generate).toHaveBeenCalledTimes(1); expect(h.rpc).toHaveBeenCalledTimes(4);
});
it.each([false, "error", "reject"])("keeps sharing successful when conditional persistence returns %s", async outcome => {
  setup(true);
  if (outcome === "reject") h.rpc.mockRejectedValueOnce(new Error("private"));
  else h.rpc.mockResolvedValueOnce({ data: false, error: outcome === "error" ? {} : null });
  expect((await manageReplayShare(request, "source-id", 88, "owner", "create")).share).toEqual(share);
});
it("does not infer on public reads, including missing links", async () => {
  h.rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(readSharedReplay(token)).rejects.toThrow("SHARE_UNAVAILABLE");
  expect(h.generate).not.toHaveBeenCalled();
});
