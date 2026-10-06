import "server-only";
import { z } from "zod";
import { usagePolicy } from "./policy";
import { creationIP, hashUsageIdentity, localCreationIdentity } from "./identity";
import { UsageLimitError, UsageUnavailableError } from "./errors";
import { BotStepClaimLostError } from "@/lib/poker/bot-step-claims";
import { GameConflictError } from "@/lib/supabase/queries";

export interface UsageClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
const resultSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("admitted") }),
  z.object({ outcome: z.literal("denied"), code: z.enum(["OWNER_AI_LIMIT", "GAME_AI_RATE_LIMIT", "GAME_CREATION_LIMIT"]), retryAfterMs: z.number().int().min(1).max(3_600_000) }),
  z.object({ outcome: z.enum(["claim_lost", "conflict"]) }),
]);
async function admit(client: UsageClient, name: string, args: Record<string, unknown>) {
  let response;
  try { response = await client.rpc(name, args); } catch { throw new UsageUnavailableError(); }
  if (response.error) {
    if (typeof response.error === "object" && response.error !== null && "message" in response.error && response.error.message === "BOT_STEP_CLAIM_LOST") throw new BotStepClaimLostError();
    throw new UsageUnavailableError();
  }
  const result = resultSchema.safeParse(response.data);
  if (!result.success) throw new UsageUnavailableError();
  if (result.data.outcome === "denied") {
    console.info("Usage admission denied", { category: result.data.code });
    throw new UsageLimitError(result.data.code, result.data.retryAfterMs);
  }
  return result.data.outcome;
}
export async function admitCreation(client: UsageClient, request: Request, hostToken: string) {
  const outcome = await admit(client, "admit_game_creation", {
    p_owner_hash: hashUsageIdentity("owner", hostToken),
    p_ip_hash: hashUsageIdentity("ip", creationIP(request, localCreationIdentity())),
    p_owner_allowance: usagePolicy.ownerCreation.allowance,
    p_ip_allowance: usagePolicy.ipCreation.allowance,
    p_window_ms: usagePolicy.ownerCreation.windowMs,
  });
  if (outcome !== "admitted") throw new UsageUnavailableError();
}
export async function admitInference(client: UsageClient, input: { gameId: string; expectedVersion: number; claimToken: string; hostToken: string | null }) {
  if (!input.hostToken) throw new UsageUnavailableError();
  const outcome = await admit(client, "admit_external_bot_call", {
    p_game_id: input.gameId, p_expected_version: input.expectedVersion, p_claim_token: input.claimToken,
    p_owner_hash: hashUsageIdentity("owner", input.hostToken),
    p_owner_allowance: usagePolicy.ownerAI.allowance, p_owner_window_ms: usagePolicy.ownerAI.windowMs,
    p_game_allowance: usagePolicy.gameAI.allowance, p_game_window_ms: usagePolicy.gameAI.windowMs,
  });
  if (outcome === "conflict") throw new GameConflictError(input.gameId, input.expectedVersion);
  if (outcome === "claim_lost") throw new BotStepClaimLostError();
}
