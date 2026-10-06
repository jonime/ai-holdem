import type { PersistAIActionInput, PersistedGame } from "@/lib/supabase/queries";

export class BotStepInProgressError extends Error {
  constructor(readonly retryAfterMs: number) { super("Bot step in progress"); }
}
export class BotStepClaimLostError extends Error {
  constructor() { super("Bot step claim lost"); }
}
export interface BotStepClaimRepository {
  acquireBotStepClaim(input: { gameId: string; expectedVersion: number; actorEngineId: string; claimToken: string }): Promise<
    { outcome: "acquired" } | { outcome: "busy"; retryAfterMs: number; expiresAt: string }
  >;
  admitExternalBotCall(input: { gameId: string; expectedVersion: number; claimToken: string }): Promise<void>;
  releaseBotStepClaim(gameId: string, claimToken: string): Promise<void>;
  persistClaimedAIAction(input: PersistAIActionInput & { claimToken: string }): Promise<PersistedGame>;
}
