import { randomUUID } from "node:crypto";
import { BotStepInProgressError, type BotStepClaimRepository } from "./bot-step-claims";
import {
  BotHistoryConflictError,
  projectBotHistory,
  legacyDecisionHistory,
  type BotHandContext,
} from "./bot-history";
import { isCallerHost, type GameHostReader } from "./host-authorization";
import { requireBotDriver } from "./driver-authorization";
import { GameNotFoundError } from "./game-errors";
import { restorePersistedState } from "./persisted-state";
import {
  withOpenSeatPlaceholders,
  publicProjectionForViewer,
  currentRevealIds,
  autoRevealForCompletedState,
  publicTimerFields,
} from "./game-projection";
import type { GameReader, HandRevealReader } from "./game-service-contracts";
import type { SeatAssignmentRepository } from "./seat-contracts";
import { pokerEngineAdapter } from "./adapter";
import { createPokerAIState } from "./ai-state";
import { createSizingOptions, createLegacySizingOptions } from "@/lib/typesafe/questions";
import type { BotDescriptor } from "./types";
import type { PersistAIActionInput, PersistedGame } from "@/lib/supabase/queries";
import { GameConflictError } from "@/lib/supabase/queries";
import type { TypesafeDecisionClient } from "@/lib/typesafe/decision";
import { JevPokerBot } from "@/lib/bots/jev";
import type { BotRegistry } from "@/lib/bots/registry";
import {
  emptyDiagnostics,
  LLM_CREDIT_EXIT_RULE,
  type BotDecision,
  type PokerBot,
} from "@/lib/bots/types";
import { isLlmCreditFailure } from "@/lib/bots/provider-http-failure";
import { logBotProviderFailure } from "@/lib/bots/provider-logging";
import type { BotStepResponseEnvelope as BotStepResult } from "@/lib/http/gameplay-contracts";
export type { BotStepResponseEnvelope as BotStepResult } from "@/lib/http/gameplay-contracts";
export type TypesafeStepResult = BotStepResult;

export interface AIActionWriter {
  persistAIAction(input: PersistAIActionInput): Promise<PersistedGame>;
}

export interface BotHandContextReader {
  getBotHandContext(gameId: string, handNumber: number): Promise<BotHandContext | null>;
}

async function stepResolvedBotAction(
  repository: GameReader &
    AIActionWriter &
    GameHostReader &
    Partial<
      SeatAssignmentRepository &
        BotHandContextReader &
        HandRevealReader
    >,
  bot: PokerBot,
  botDescriptor: BotDescriptor,
  gameId: string,
  expectedVersion: number,
  viewerToken: string | null = null,
  beforeInference: () => Promise<void> = async () => {},
  commit: AIActionWriter["persistAIAction"] = input => repository.persistAIAction(input),
): Promise<BotStepResult> {
  const game = await repository.getGame(gameId);
  if (!game) {
    throw new GameNotFoundError(gameId);
  }
  await requireBotDriver(repository, gameId, restorePersistedState(game.currentState), viewerToken);
  if (game.version !== expectedVersion) {
    throw new GameConflictError(gameId, expectedVersion);
  }

  const stateBefore = restorePersistedState(game.currentState);
  const snapshotBefore = pokerEngineAdapter.snapshot(stateBefore);
  const botPlayer = stateBefore.config.players.find(
    (player) => player.id === snapshotBefore.currentActorId,
  );
  if (!botPlayer || botPlayer.controller === "human") {
    throw new Error("It is not a bot turn");
  }
  if (!snapshotBefore.street || snapshotBefore.street === "complete") {
    throw new Error("The current hand is not accepting actions");
  }

  const history = repository.getBotHandContext
    ? await repository.getBotHandContext(gameId, snapshotBefore.handNumber) : null;
  if (history && history.version !== expectedVersion) throw new GameConflictError(gameId, expectedVersion);
  let projectedHistory: ReturnType<typeof projectBotHistory>;
  try { projectedHistory = projectBotHistory(history, stateBefore, botPlayer.id); }
  catch (error) {
    if (error instanceof BotHistoryConflictError) throw new GameConflictError(gameId, expectedVersion);
    throw error;
  }
  const aiState = createPokerAIState(stateBefore, botPlayer.id, {
    difficulty: botPlayer.aiDifficulty ?? "medium",
    decisionHistory: botDescriptor.provider === "rules" ? legacyDecisionHistory(projectedHistory.actions) : projectedHistory.actions,
    historyStatus: projectedHistory.status,
    correctedContext: botDescriptor.provider !== "rules",
  });
  const context = { ...aiState, sizingOptions: botDescriptor.provider === "rules"
    ? createLegacySizingOptions(aiState) : createSizingOptions(aiState) };
  if (botDescriptor.provider !== "rules") await beforeInference();
  let decision: BotDecision;
  let creditFailure: unknown;
  try {
    decision = await bot.decide(context);
  } catch (error) {
    if (botDescriptor.provider !== "llm" || !isLlmCreditFailure(error) ||
        !pokerEngineAdapter.getLegalActions(stateBefore).some(action => action.type === "fold")) throw error;
    creditFailure = error;
    decision = {
      action: { type: "fold" },
      diagnostics: emptyDiagnostics({ matchedRule: LLM_CREDIT_EXIT_RULE, botProfileId: botPlayer.botProfileId ?? null }),
      rawResponse: null,
    };
  }
  const stateAfter = pokerEngineAdapter.applyAction(
    stateBefore,
    botPlayer.id,
    decision.action,
  );
  const snapshotAfter = pokerEngineAdapter.snapshot(stateAfter);
  const persistedGame = await commit({
    gameId,
    expectedVersion,
    leaveSeat: creditFailure !== undefined,
    playerEngineId: botPlayer.id,
    currentState: stateAfter,
    stateSchemaVersion: stateAfter.stateSchemaVersion,
    handNumber: snapshotAfter.handNumber,
    status: snapshotAfter.street === "complete" ? "complete" : "playing",
    street: snapshotBefore.street,
    action: decision.action.type,
    amount:
      "amount" in decision.action ? (decision.action.amount ?? null) : null,
    stateBefore,
    handComplete: snapshotAfter.street === "complete",
    choice: decision.action.type,
    bot: botDescriptor,
    matchedRule: decision.diagnostics.matchedRule,
    ...(() => {
      const autoReveal = autoRevealForCompletedState(
        stateAfter,
        game.botsShowUncontestedWins ?? false,
      );
      return autoReveal
        ? {
            autoRevealPlayerEngineId: autoReveal.playerId,
            autoRevealReason: autoReveal.reason,
          }
        : {};
    })(),
  });

  if (creditFailure !== undefined) logBotProviderFailure(gameId, creditFailure, "fold_and_leave");

  const projectedState = repository.getSeatAssignments
    ? await withOpenSeatPlaceholders(
        repository as SeatAssignmentRepository,
        gameId,
        stateAfter,
      )
    : stateAfter;

  return {
    game: {
      id: persistedGame.id,
      status: persistedGame.status,
      version: persistedGame.version,
    ...publicTimerFields(persistedGame),
      viewerIsHost: await isCallerHost(repository, gameId, viewerToken),
      poker: publicProjectionForViewer(
        projectedState,
        viewerToken,
        await currentRevealIds(repository, gameId, snapshotAfter.handNumber),
        persistedGame.botsShowUncontestedWins ?? false,
      ),
    },
    aiDecision: {
      action: decision.action.type,
      amount:
        "amount" in decision.action ? (decision.action.amount ?? null) : null,
      bot: botDescriptor,
      botProfileId: decision.diagnostics.botProfileId,
      probabilities: decision.diagnostics.probabilities,
      confidence: decision.diagnostics.confidence,
      sizing: decision.diagnostics.sizing,
      matchedRule: decision.diagnostics.matchedRule,
    },
  };
}

export async function stepBotAction(
  repository: Parameters<typeof stepResolvedBotAction>[0] & BotStepClaimRepository,
  registry: BotRegistry,
  gameId: string,
  expectedVersion: number,
  viewerToken: string | null = null,
): Promise<BotStepResult> {
  const game = await repository.getGame(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  await requireBotDriver(repository, gameId, restorePersistedState(game.currentState), viewerToken);
  if (game.version !== expectedVersion) {
    throw new GameConflictError(gameId, expectedVersion);
  }
  const state = restorePersistedState(game.currentState);
  const snapshot = pokerEngineAdapter.snapshot(state);
  const actorId = snapshot.currentActorId;
  const player = state.config.players.find(
    (candidate) => candidate.id === actorId,
  );
  if (!player || player.controller === "human" || !snapshot.street || snapshot.street === "complete") {
    throw new Error("It is not a bot turn");
  }
  const claimToken = randomUUID();
  const claim = await repository.acquireBotStepClaim({ gameId, expectedVersion, actorEngineId: player.id, claimToken });
  if (claim.outcome === "busy") throw new BotStepInProgressError(claim.retryAfterMs);
  try {
    const botId = player.bot?.id ?? "jev";
    const resolved = registry.get({
      botId,
      profileId: player.botProfileId,
    });
    return await stepResolvedBotAction(
      repository,
      resolved.bot,
      resolved.descriptor,
      gameId,
      expectedVersion,
      viewerToken,
      () => repository.admitExternalBotCall({ gameId, expectedVersion, claimToken }),
      input => repository.persistClaimedAIAction({ ...input, claimToken }),
    );
  } finally {
    try { await repository.releaseBotStepClaim(gameId, claimToken); }
    catch { console.warn("Bot claim cleanup failed", { gameId }); }
  }
}

/** Legacy test seam retained while callers migrate to the bot registry. */
export async function stepTypesafeAction(
  repository: Parameters<typeof stepResolvedBotAction>[0],
  client: TypesafeDecisionClient,
  gameId: string,
  viewerToken: string | null = null,
): Promise<BotStepResult> {
  const game = await repository.getGame(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  await requireBotDriver(repository, gameId, restorePersistedState(game.currentState), viewerToken);
  return stepResolvedBotAction(
    repository,
    new JevPokerBot(client),
    {
      id: "jev",
      label: "TypeSafe Jev",
      provider: "typesafe",
      modelId: "jev-latest",
    },
    gameId,
    game.version,
    viewerToken,
  );
}

