import "server-only";
import { createHash } from "node:crypto";
import { sanitizePlayerName } from "./game-service";
import { creationIP, hashUsageIdentity, localCreationIdentity } from "@/lib/usage/identity";
import { usagePolicy } from "@/lib/usage/policy";
import type { CreateGameRequest } from "@/lib/http/creation-contracts";

export function creationAttemptArguments(request: Request, owner: string, attemptId: string,
  intent: CreateGameRequest & { mode: "custom" | "quick"; botMode?: "rules" }) {
  const normalized = intent.mode === "custom"
    ? { mode: "custom", name: sanitizePlayerName(intent.hostName, "Player 1"), seatCount: intent.seatCount ?? 6, humanTurnSeconds: intent.humanTurnSeconds === undefined ? 60 : intent.humanTurnSeconds }
    : { mode: "quick", name: sanitizePlayerName(intent.hostName, "Player 1"), botMode: intent.botMode ?? "catalog" };
  return {
    // Replay scope is stable even if the allowance hash secret rotates.
    p_owner: createHash("sha256").update(`ai-holdem:creation:owner:v1\0${owner}`).digest("hex"),
    p_attempt_id: attemptId,
    p_fingerprint: createHash("sha256").update(JSON.stringify(normalized)).digest("hex"),
    p_owner_hash: hashUsageIdentity("owner", owner),
    p_ip_hash: hashUsageIdentity("ip", creationIP(request, localCreationIdentity())),
    p_owner_allowance: usagePolicy.ownerCreation.allowance,
    p_ip_allowance: usagePolicy.ipCreation.allowance,
    p_window_ms: usagePolicy.ownerCreation.windowMs,
  };
}
