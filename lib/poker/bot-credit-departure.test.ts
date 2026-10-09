import { withBotClaims } from "@/test/fixtures/bot-claims";
import { BotStepInProgressError } from "./bot-step-claims";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BotProviderError, LLM_CREDIT_EXIT_RULE } from "@/lib/bots/types";
import { providerHttpFailureDiagnostics } from "@/lib/bots/provider-http-failure";
import { GameConflictError, type PersistAIActionInput, type PersistedGame } from "@/lib/supabase/queries";
import { createDeterministicDeck, pokerEngineAdapter } from "./adapter";
import { BotStepForbiddenError } from "./driver-authorization";
import { stepBotAction } from "./bot-turn-service";
import type { BotDescriptor } from "./types";

const descriptor = { id: "llm", label: "LLM", provider: "llm", modelId: "vendor/model" } satisfies BotDescriptor;

function setup(status = 402, provider: BotDescriptor["provider"] = "llm") {
  const botDescriptor = { ...descriptor, provider };
  const started = pokerEngineAdapter.startHand(pokerEngineAdapter.createGame({
    smallBlind: 50, bigBlind: 100,
    players: [
      { id: "human", name: "Human", controller: "human", seat: 0, stack: 1000, playerToken: "owner" },
      { id: "bot", name: "Bot", controller: "bot", seat: 1, stack: 1000, bot: botDescriptor, botProfileId: "balanced" },
    ],
  }), createDeterministicDeck());
  const currentState = pokerEngineAdapter.applyAction(started, "human", { type: "call", amount: 50 });
  let stored: PersistedGame = { id: "game-1", status: "playing", currentState, stateSchemaVersion: 1, handNumber: 1, version: 1 };
  let leaving = false;
  const failure = new BotProviderError(`LLM provider request failed with HTTP ${status}`,
    providerHttpFailureDiagnostics(new Response(null, { status }), { error: { code: status } }));
  const decide = vi.fn().mockRejectedValue(failure);
  const repository = {
    getGame: async () => stored,
    getHostToken: async () => "host",
    getSeatAssignments: async () => [
      { gameId: "game-1", seat: 0, status: "claimed" as const, controller: "human" as const, playerToken: "owner", isHost: false, enginePlayerId: "human" },
      { gameId: "game-1", seat: 1, status: "bot" as const, controller: "bot" as const, playerToken: null, isHost: false, enginePlayerId: "bot", bot: botDescriptor, botProfileId: "balanced" as const, leaving },
    ],
    persistAIAction: vi.fn(async (input: PersistAIActionInput) => {
      if (input.expectedVersion !== stored.version) throw new GameConflictError(stored.id, input.expectedVersion);
      stored = { ...stored, currentState: input.currentState, status: input.status, version: stored.version + 1 };
      leaving = input.leaveSeat ?? false;
      return stored;
    }),
  };
  return { repository: withBotClaims(repository), registry: { get: () => ({ bot: { decide }, descriptor: botDescriptor }) }, decide, failure, currentState };
}

afterEach(() => vi.restoreAllMocks());

describe("bot credit departure", () => {
  it.each(["owner", "host"])("lets an authorized %s commit exactly one legal fold and departure", async token => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { repository, registry, decide } = setup();
    const result = await stepBotAction(repository, registry, "game-1", 1, token);
    expect(decide).toHaveBeenCalledOnce();
    expect(repository.persistAIAction).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      expectedVersion: 1, action: "fold", choice: "fold", leaveSeat: true,
      matchedRule: LLM_CREDIT_EXIT_RULE,
    }));
    expect(result.game).toMatchObject({ version: 2, status: "complete" });
    expect(result.game.poker.players.find(player => player.id === "bot")).toMatchObject({ folded: true, leaving: true });
    expect(result.aiDecision).toMatchObject({ action: "fold", matchedRule: LLM_CREDIT_EXIT_RULE });
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).toContain('fold_and_leave');
  });

  it.each([429, 503])("pauses on HTTP %s without any mutation", async status => {
    const { repository, registry, failure } = setup(status);
    await expect(stepBotAction(repository, registry, "game-1", 1, "owner")).rejects.toBe(failure);
    expect(repository.persistAIAction).not.toHaveBeenCalled();
  });


  it.each(["timeout", "network", "rate_limit", "invalid_response", "provider"] as const)("keeps %s failures seated with no commit", async category => {
    const { repository, registry, decide } = setup();
    const failure = new BotProviderError("private text", undefined, { category });
    decide.mockRejectedValue(failure);
    await expect(stepBotAction(repository, registry, "game-1", 1, "owner")).rejects.toBe(failure);
    expect(repository.persistAIAction).not.toHaveBeenCalled();
    expect((await repository.getGame()).version).toBe(1);
    expect((await repository.getSeatAssignments())[1].leaving).toBe(false);
  });

  it("does not infer Jev credit exhaustion from an LLM error", async () => {
    const { repository, registry, failure } = setup(402, "typesafe");
    await expect(stepBotAction(repository, registry, "game-1", 1, "owner")).rejects.toBe(failure);
    expect(repository.persistAIAction).not.toHaveBeenCalled();
  });

  it("does not call inference or fold a bot whose all-in has already settled", async () => {
    const { repository, registry, decide, currentState } = setup();
    const allIn = pokerEngineAdapter.applyAction(currentState, "bot", { type: "raise", amount: 1000 });
    const complete = pokerEngineAdapter.applyAction(allIn, "human", { type: "call", amount: 900 });
    const game = await repository.getGame();
    vi.spyOn(repository, "getGame").mockResolvedValue({ ...game, currentState: complete, status: "complete" });
    await expect(stepBotAction(repository, registry, "game-1", 1, "owner")).rejects.toThrow("It is not a bot turn");
    expect(decide).not.toHaveBeenCalled();
    expect(repository.persistAIAction).not.toHaveBeenCalled();
  });

  it("rejects spectators and stale versions before inference", async () => {
    const { repository, registry, decide } = setup();
    await expect(stepBotAction(repository, registry, "game-1", 1, "spectator")).rejects.toBeInstanceOf(BotStepForbiddenError);
    await expect(stepBotAction(repository, registry, "game-1", 0, "owner")).rejects.toBeInstanceOf(GameConflictError);
    expect(decide).not.toHaveBeenCalled();
    expect(repository.persistAIAction).not.toHaveBeenCalled();
  });

  it("preserves conflict handling if another request commits during inference", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { repository, registry } = setup();
    repository.persistAIAction.mockRejectedValue(new GameConflictError("game-1", 1));
    await expect(stepBotAction(repository, registry, "game-1", 1, "owner")).rejects.toBeInstanceOf(GameConflictError);
    expect((await repository.getSeatAssignments())[1].leaving).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
  it("commits only one fold and departure when two authorized requests race", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { repository, registry } = setup();
    const results = await Promise.allSettled([
      stepBotAction(repository, registry, "game-1", 1, "owner"),
      stepBotAction(repository, registry, "game-1", 1, "host"),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(BotStepInProgressError);
    expect((await repository.getGame()).version).toBe(2);
    expect((await repository.getSeatAssignments())[1].leaving).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });
});
