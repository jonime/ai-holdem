import { vi } from "vitest";
import { BotStepClaimLostError, type BotStepClaimRepository } from "@/lib/poker/bot-step-claims";
import { GameConflictError, type PersistAIActionInput, type PersistedGame } from "@/lib/supabase/queries";

/** Stateful lease fake for service races, expiry and fencing; SQL tests cover real locks. */
export function withBotClaims<T extends {
  getGame: (gameId: string) => Promise<PersistedGame | null>;
  persistAIAction: (input: PersistAIActionInput) => Promise<PersistedGame>;
}>(repository: T) {
  let claim: { claimToken: string; expectedVersion: number; actorEngineId: string; expires: number } | null = null;
  const claims = {
    acquireBotStepClaim: vi.fn<BotStepClaimRepository["acquireBotStepClaim"]>(async input => {
      const game = await repository.getGame(input.gameId);
      if (game?.version !== input.expectedVersion) throw new GameConflictError(input.gameId, input.expectedVersion);
      if (claim && claim.expectedVersion === input.expectedVersion && claim.actorEngineId === input.actorEngineId && claim.expires > Date.now()) {
        return { outcome: "busy", retryAfterMs: claim.expires - Date.now(), expiresAt: new Date(claim.expires).toISOString() };
      }
      claim = { ...input, expires: Date.now() + 90_000 };
      return { outcome: "acquired" };
    }),
    releaseBotStepClaim: vi.fn<BotStepClaimRepository["releaseBotStepClaim"]>(async (_gameId, token) => {
      if (claim?.claimToken === token) claim = null;
    }),
    persistClaimedAIAction: vi.fn<BotStepClaimRepository["persistClaimedAIAction"]>(async input => {
      if ((await repository.getGame(input.gameId))?.version !== input.expectedVersion) throw new GameConflictError(input.gameId, input.expectedVersion);
      if (!claim || claim.claimToken !== input.claimToken || claim.actorEngineId !== input.playerEngineId || claim.expires <= Date.now()) throw new BotStepClaimLostError();
      const result = await repository.persistAIAction(input);
      claim = null;
      return result;
    }),
  };
  return Object.assign(repository, claims);
}
