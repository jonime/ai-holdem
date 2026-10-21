import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { reconstructHandReplay } from "./hand-replay";
import { shareManagementSchema, sharedReplaySchema, type ReplayData } from "@/lib/http/share-contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toJson } from "@/lib/supabase/contracts";
import { hashUsageIdentity, creationIP, localCreationIdentity } from "@/lib/usage/identity";
import { usagePolicy } from "@/lib/usage/policy";

export class ShareOutcome extends Error {
  constructor(readonly code: "SHARE_FORBIDDEN" | "SHARE_UNAVAILABLE" | "SHARE_CONFLICT" | "SHARE_CREATION_LIMIT", readonly retryAfterMs?: number) { super(code); }
}
export function projectSharedReplay(source: ReturnType<typeof reconstructHandReplay>, token: string) {
  const owners = source.holdings.filter(p => p.controller === "human" && p.token === token);
  if (owners.length !== 1) throw new ShareOutcome("SHARE_FORBIDDEN");
  const owner = owners[0];
  const publicCards = source.replay.frames.at(-1)!.players;
  const visible = new Map(source.holdings.map(p => [p.seat,
    p.id === owner.id || p.controller !== "human" || Boolean(publicCards.find(v => v.seat === p.seat)?.cards) ? p.cards : null]));
  // Construct an allowlist. Source IDs and hand number have no place in the snapshot.
  const { bigBlind, dealerSeat, smallBlindSeat, bigBlindSeat, participants, pots } = source.replay;
  const replay: ReplayData = { ...(bigBlind === undefined ? {} : { bigBlind }), dealerSeat, smallBlindSeat, bigBlindSeat, participants, pots,
    frames: source.replay.frames.map(frame => ({ ...frame, players: frame.players.map(p => ({ ...p, cards: visible.get(p.seat) ?? null })) })) };
  return sharedReplaySchema.parse({ schemaVersion: 1, replay });
}
const outcomeSchema = z.object({ outcome: z.enum(["forbidden", "conflict", "denied"]), retryAfterMs: z.number().int().positive().max(3_600_000).optional() });
export async function manageReplayShare(request: Request, gameId: string, handNumber: number, token: string | null, operation: "read" | "create" | "revoke") {
  if (!token) throw new ShareOutcome("SHARE_FORBIDDEN");
  const client = createSupabaseServerClient();
  const read = await client.rpc("get_hand_replay", { p_game_id: gameId, p_hand_number: handNumber });
  if (read.error) throw new Error("Replay read failed");
  const snapshot = projectSharedReplay(reconstructHandReplay(read.data, gameId, handNumber), token);
  const result = await client.rpc("manage_replay_share", {
    p_game_id: gameId, p_hand_number: handNumber, p_creator_token: token, p_operation: operation,
    p_link_token: operation === "create" ? randomBytes(32).toString("hex") : "",
    p_snapshot: toJson(snapshot), p_history: toJson(read.data),
    p_owner_hash: operation === "create" ? hashUsageIdentity("owner", token) : "",
    p_ip_hash: operation === "create" ? hashUsageIdentity("ip", creationIP(request, localCreationIdentity())) : "",
    p_owner_allowance: usagePolicy.ownerShare.allowance, p_ip_allowance: usagePolicy.ipShare.allowance,
    p_window_ms: usagePolicy.ownerShare.windowMs,
  });
  if (result.error) throw new Error("Share management failed");
  const outcome = outcomeSchema.safeParse(result.data);
  if (outcome.success) throw new ShareOutcome(outcome.data.outcome === "forbidden" ? "SHARE_FORBIDDEN" : outcome.data.outcome === "conflict" ? "SHARE_CONFLICT" : "SHARE_CREATION_LIMIT", outcome.data.retryAfterMs);
  return shareManagementSchema.parse(result.data);
}
export async function readSharedReplay(token: string) {
  const { data, error } = await createSupabaseServerClient().rpc("read_replay_share", { p_link_token: token });
  if (error) throw new Error("Shared replay read failed");
  if (data === null) throw new ShareOutcome("SHARE_UNAVAILABLE");
  return sharedReplaySchema.parse(data);
}
