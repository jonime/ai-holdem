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
  expect(rpc).toHaveBeenCalledWith("list_replay_shares_with_title", { p_creator_token: "owner", p_before_created_at: query.beforeCreatedAt, p_before_token: token });
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
it("requires the cookie owner and propagates title conflicts without overwriting", async () => {
  const { editOwnedShareTitle } = await import("./owned-shares");
  await expect(editOwnedShareTitle(null, token, { title: null, titleRevision: 0 })).rejects.toThrow("SHARE_FORBIDDEN");
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValueOnce({ data: { outcome: "conflict" }, error: null });
  await expect(editOwnedShareTitle("owner", token, { title: "My title", titleRevision: 2 })).rejects.toThrow("SHARE_CONFLICT");
  expect(rpc).toHaveBeenCalledWith("edit_replay_share_title", { p_creator_token: "owner", p_link_token: token, p_title: "My title", p_revision: 2 });
});
