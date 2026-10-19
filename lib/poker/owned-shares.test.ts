import { beforeEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => ({ rpc }) }));
import { listOwnedShares, revokeOwnedShare } from "./owned-shares";
const token = "b".repeat(64);
beforeEach(() => vi.clearAllMocks());
it("does not access the database or create identity for a missing cookie", async () => {
  expect(await listOwnedShares(null)).toEqual({ shares: [], nextCursor: null });
  expect(await revokeOwnedShare(null, token)).toEqual({ revoked: true });
  expect(rpc).not.toHaveBeenCalled();
});
it("passes precise timestamp cursors and owner to the list RPC and validates returned rows", async () => {
  rpc.mockResolvedValue({ data: { shares: [], nextCursor: null }, error: null });
  const query = { beforeCreatedAt: "2026-01-01T00:00:00.123456Z", beforeToken: token };
  await listOwnedShares("owner", query);
  expect(rpc).toHaveBeenCalledWith("list_replay_shares", { p_creator_token: "owner", p_before_created_at: query.beforeCreatedAt, p_before_token: token });
  rpc.mockResolvedValue({ data: { shares: [{ snapshot: {} }], nextCursor: null }, error: null });
  await expect(listOwnedShares("owner")).rejects.toThrow();
});
it("revokes exactly one token and keeps database failures visible", async () => {
  rpc.mockResolvedValue({ data: { revoked: true }, error: null });
  await revokeOwnedShare("owner", token);
  expect(rpc).toHaveBeenCalledWith("revoke_owned_replay_share", { p_creator_token: "owner", p_link_token: token });
  rpc.mockResolvedValue({ data: null, error: { message: "private" } });
  await expect(revokeOwnedShare("owner", token)).rejects.toThrow("Share revocation failed");
});
