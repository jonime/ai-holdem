import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { shareListQuerySchema, shareListSchema, revokeShareSchema, shareTokenSchema, type ShareListQuery } from "@/lib/http/share-contracts";

export async function listOwnedShares(owner: string | null, query: ShareListQuery = {}) {
  const cursor = shareListQuerySchema.parse(query);
  if (!owner) return shareListSchema.parse({ shares: [], nextCursor: null });
  const { data, error } = await createSupabaseServerClient().rpc("list_replay_shares", {
    p_creator_token: owner, p_before_created_at: cursor.beforeCreatedAt, p_before_token: cursor.beforeToken,
  });
  if (error) throw new Error("Share list failed");
  return shareListSchema.parse(data);
}
export async function revokeOwnedShare(owner: string | null, token: string) {
  shareTokenSchema.parse(token);
  if (!owner) return revokeShareSchema.parse({ revoked: true });
  const { data, error } = await createSupabaseServerClient().rpc("revoke_owned_replay_share", { p_creator_token: owner, p_link_token: token });
  if (error) throw new Error("Share revocation failed");
  return revokeShareSchema.parse(data);
}
