import { describe, expect, it, vi } from "vitest";
import { withBotClaims } from "@/test/fixtures/bot-claims";
import { BotStepInProgressError } from "./bot-step-claims";
import { BotStepForbiddenError } from "./driver-authorization";
import { GameNotFoundError } from "./game-errors";
import { stepBotAction, stepTypesafeAction } from "./bot-turn-service";
import { createDeterministicDeck, pokerEngineAdapter } from "./adapter";
import { emptyDiagnostics, type BotDecision } from "@/lib/bots/types";
import { GameConflictError, type PersistedGame, type PersistAIActionInput } from "@/lib/supabase/queries";
import type { BotStepClaimRepository } from "./bot-step-claims";

function orderedTurn() {
  const calls: string[] = [];
  const initial = pokerEngineAdapter.startHand(pokerEngineAdapter.createGame({
    smallBlind: 1, bigBlind: 2,
    players: [
      { id: "human", seat: 0, name: "Human", controller: "human", stack: 200, playerToken: "owner" },
      { id: "bot", seat: 1, name: "Bot", controller: "bot", stack: 200 },
    ],
  }), createDeterministicDeck());
  const game: PersistedGame = {
    id: "game", status: "playing", version: 1, handNumber: 1, stateSchemaVersion: 1,
    currentState: pokerEngineAdapter.applyAction(initial, "human", { type: "call", amount: 1 }),
  };
  const repository = {
    getGame: vi.fn(async (): Promise<PersistedGame | null> => { calls.push("read"); return game; }),
    getHostToken: vi.fn(async (): Promise<string | null> => { calls.push("authorize"); return "owner"; }),
    acquireBotStepClaim: vi.fn<BotStepClaimRepository["acquireBotStepClaim"]>(async () => {
      calls.push("claim"); return { outcome: "acquired" };
    }),
    getBotHandContext: vi.fn(async () => { calls.push("history"); return null; }),
    admitExternalBotCall: vi.fn<BotStepClaimRepository["admitExternalBotCall"]>(async () => { calls.push("admit"); }),
    persistAIAction: vi.fn(),
    persistClaimedAIAction: vi.fn<BotStepClaimRepository["persistClaimedAIAction"]>(async input => {
      calls.push("commit"); return { ...game, currentState: input.currentState, version: 2 };
    }),
    getCurrentHandRevealedPlayerIds: vi.fn(async () => { calls.push("reveals"); return []; }),
    releaseBotStepClaim: vi.fn<BotStepClaimRepository["releaseBotStepClaim"]>(async () => { calls.push("release"); }),
  };
  const decide = vi.fn(async (): Promise<BotDecision> => {
    calls.push("decide");
    return { action: { type: "check" as const }, diagnostics: emptyDiagnostics(), rawResponse: null };
  });
  const registry = { get: vi.fn(() => {
    calls.push("resolve");
    return { bot: { decide }, descriptor: { id: "jev", label: "Jev", provider: "typesafe" as const, modelId: "jev-latest" } };
  }) };
  const step = () => stepBotAction(repository, registry, "game", 1, "owner");
  return { calls, game, repository, registry, decide, step };
}

describe("claimed bot pipeline ordering", () => {
  it("keeps both reads and authorizations, then admits and commits with the acquired token", async () => {
    const f = orderedTurn();
    const result = await f.step();
    expect(f.calls).toEqual([
      "read", "authorize", "claim", "resolve", "read", "authorize",
      "history", "admit", "decide", "commit", "authorize", "reveals", "release",
    ]);
    const { claimToken } = f.repository.acquireBotStepClaim.mock.calls[0][0];
    expect(f.repository.admitExternalBotCall).toHaveBeenCalledWith({ gameId: "game", expectedVersion: 1, claimToken });
    expect(f.repository.persistClaimedAIAction).toHaveBeenCalledWith(expect.objectContaining({ claimToken }));
    expect(f.repository.persistAIAction).not.toHaveBeenCalled();
    expect(f.repository.getCurrentHandRevealedPlayerIds).toHaveBeenCalledWith("game", 1);
    expect(f.repository.releaseBotStepClaim).toHaveBeenCalledWith("game", claimToken);
    expect(JSON.stringify(result)).not.toContain(claimToken);
  });

  it.each(["missing", "version", "ownership"] as const)("revalidates %s on the second read before context or inference", async kind => {
    const f = orderedTurn();
    f.repository.getGame.mockResolvedValueOnce(f.game).mockResolvedValueOnce(
      kind === "missing" ? null : { ...f.game, version: kind === "version" ? 2 : 1 },
    );
    if (kind === "ownership") {
      f.repository.getHostToken.mockResolvedValueOnce("owner").mockResolvedValueOnce(null);
      Object.assign(f.repository, { getSeatAssignments: vi.fn(async () => []) });
    }
    const errorClass = kind === "missing" ? GameNotFoundError : kind === "version" ? GameConflictError : BotStepForbiddenError;
    await expect(f.step()).rejects.toBeInstanceOf(errorClass);
    expect(f.registry.get).toHaveBeenCalledOnce();
    expect(f.repository.getGame).toHaveBeenCalledTimes(2);
    expect(f.repository.getBotHandContext).not.toHaveBeenCalled();
    expect(f.repository.admitExternalBotCall).not.toHaveBeenCalled();
    expect(f.decide).not.toHaveBeenCalled();
    expect(f.repository.persistClaimedAIAction).not.toHaveBeenCalled();
    expect(f.repository.releaseBotStepClaim).toHaveBeenCalledOnce();
  });

  it("rejects an illegal provider decision before persistence and releases the claim", async () => {
    const f = orderedTurn();
    f.decide.mockResolvedValueOnce({ action: { type: "call" }, diagnostics: emptyDiagnostics(), rawResponse: null });
    await expect(f.step()).rejects.toThrow();
    expect(f.repository.persistClaimedAIAction).not.toHaveBeenCalled();
    expect(f.repository.releaseBotStepClaim).toHaveBeenCalledOnce();
  });
});

describe("stepTypesafeAction", () => {
  it.each(["host-token"])(
    "applies an AI action with a private response for viewer %s",
    async (viewerToken) => {
      const started = pokerEngineAdapter.startHand(
        pokerEngineAdapter.createGame({
          smallBlind: 50,
          bigBlind: 100,
          players: [
            {
              id: "human",
              name: "You",
              controller: "human",
              seat: 0,
              stack: 10_000,
              playerToken: "host-token",
              isHost: true,
            },
            {
              id: "typesafe-ai",
              name: "TypeSafe AI",
              controller: "typesafe_ai",
              seat: 1,
              stack: 10_000,
            },
          ],
        }),
        createDeterministicDeck(),
      );
      const aiTurn = pokerEngineAdapter.applyAction(started, "human", {
        type: "call",
        amount: 50,
      });
      const persistAIAction = vi.fn().mockResolvedValue({
        id: "game-1",
        status: "playing",
        currentState: {},
        stateSchemaVersion: 1,
        handNumber: 1,
        version: 2,
      });

      const game = await stepTypesafeAction(
        {
          getHostToken: async () => null,
          getGame: vi.fn().mockResolvedValue({
            id: "game-1",
            status: "playing",
            currentState: aiTurn,
            stateSchemaVersion: 1,
            handNumber: 1,
            version: 1,
          }),
          getBotHandContext: vi.fn().mockResolvedValue({
            version: 1, handNumber: 1, initialState: started,
            actions: [{ sequence: 1, action: { type: "call", amount: 50 }, stateBefore: started }],
          }),
          persistAIAction,
        },
        {
          evaluate: async (request) => {
            const choices = Object.keys(request.questions.move.criteria);
            return {
              answers: {
                move: {
                  type: "choice",
                  choice: "check",
                  probabilities: Object.fromEntries(
                    choices.map((choice) => [
                      choice,
                      choice === "check" ? 1 : 0,
                    ]),
                  ),
                  confidence: 1,
                },
              },
            };
          },
        },
        "game-1",
        viewerToken,
      );

      expect(game.game.version).toBe(2);
      const human = game.game.poker.players.find(
        (player) => player.id === "human",
      );
      expect(human?.playerToken).toBe(
        viewerToken === "host-token" ? "host-token" : null,
      );
      expect(human?.isHost).toBe(true);
      if (viewerToken === "host-token") {
        expect(human?.holeCards).toHaveLength(2);
      } else {
        expect(human?.holeCards).toBeNull();
        expect(game.game.poker.legalActions).toEqual([]);
      }
      expect(
        game.game.poker.players.find((player) => player.id === "typesafe-ai"),
      ).toMatchObject({
        playerToken: null,
        holeCards: null,
      });
      expect(game.game.poker.currentActorId).toBe("typesafe-ai");
      expect(game.aiDecision.action).toBe("check");
      expect(persistAIAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "check",
          choice: "check",
        }),
      );
    },
  );

  it("rejects attempts to step a human turn", async () => {
    const humanTurn = pokerEngineAdapter.startHand(
      pokerEngineAdapter.createGame({
        smallBlind: 50,
        bigBlind: 100,
        players: [
          {
            id: "human",
            name: "You",
            controller: "human",
            seat: 0,
            stack: 10_000,
          },
          {
            id: "typesafe-ai",
            name: "TypeSafe AI",
            controller: "typesafe_ai",
            seat: 1,
            stack: 10_000,
          },
        ],
      }),
      createDeterministicDeck(),
    );
    await expect(
      stepTypesafeAction(
        {
          getGame: vi.fn().mockResolvedValue({
            id: "game-1",
            status: "playing",
            currentState: humanTurn,
            stateSchemaVersion: 1,
            handNumber: 1,
            version: 0,
          }),
          getHostToken: async () => "host-token",
          persistAIAction: vi.fn(),
        },
        { evaluate: vi.fn() },
        "game-1",
        "host-token",
      ),
    ).rejects.toThrow("not a bot turn");
  });
});

describe("bot driver authorization", () => {
  const started = pokerEngineAdapter.startHand(pokerEngineAdapter.createGame({
    smallBlind: 50, bigBlind: 100,
    players: [
      { id: "human", name: "Human", controller: "human", seat: 0, stack: 1000, playerToken: "owner" },
      { id: "bot", name: "Bot", controller: "bot", seat: 1, stack: 1000 },
    ],
  }), createDeterministicDeck());
  const currentState = pokerEngineAdapter.applyAction(started, "human", { type: "call", amount: 50 });
  const game = { id: "game-1", status: "playing" as const, currentState, stateSchemaVersion: 1, handNumber: 1, version: 1 };

  it.each([null, "spectator", "", "owner"])("rejects nonowners %s before registry, inference, or persistence", async token => {
    const persistAIAction = vi.fn();
    const evaluate = vi.fn();
    const get = vi.fn();
    const repository = { getGame: async () => game, getHostToken: async () => null,
      getSeatAssignments: async () => [], persistAIAction };
    await expect(stepBotAction(withBotClaims(repository), { get }, "game-1", 0, token)).rejects.toBeInstanceOf(BotStepForbiddenError);
    await expect(stepTypesafeAction(repository, { evaluate }, "game-1", token)).rejects.toBeInstanceOf(BotStepForbiddenError);
    expect(get).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
    expect(persistAIAction).not.toHaveBeenCalled();
  });

  it.each(["host", "owner", "folded", "eliminated", "bot-only-host"])("permits %s before provider resolution", async token => {
    const get = vi.fn(() => { throw new Error("provider reached"); });
    const repository = { getGame: async () => game,
      getHostToken: async () => token.includes("host") ? token : "host",
      getSeatAssignments: async () => token === "bot-only-host" ? [] : [{
        gameId: "game-1", seat: 0, controller: "human" as const, status: "claimed" as const,
        playerToken: token, isHost: false,
      }], persistAIAction: vi.fn() };
    await expect(stepBotAction(withBotClaims(repository), { get }, "game-1", 1, token)).rejects.toThrow("provider reached");
    expect(get).toHaveBeenCalledOnce();
    expect(repository.persistAIAction).not.toHaveBeenCalled();
  });

  it("persists exactly one action when two authorized browsers race", async () => {
    let stored: PersistedGame = game;
    let commits = 0;
    const decide = vi.fn(async () => {
      return { action: { type: "check" as const }, diagnostics: emptyDiagnostics(), rawResponse: null };
    });
    const repository = {
      getHostToken: async () => null,
      getGame: async () => stored,
      persistAIAction: vi.fn(async (input: PersistAIActionInput) => {
        if (input.expectedVersion !== stored.version) throw new GameConflictError("game-1", input.expectedVersion);
        commits++;
        stored = { ...stored, currentState: input.currentState, version: stored.version + 1 };
        return stored;
      }),
    };
    const registry = { get: () => ({ bot: { decide }, descriptor: {
      id: "rules", label: "Rules", provider: "rules" as const, modelId: null,
    } }) };
    const claimedRepository = withBotClaims(repository);
    const results = await Promise.allSettled([
      stepBotAction(claimedRepository, registry, "game-1", 1, "owner"),
      stepBotAction(claimedRepository, registry, "game-1", 1, "owner"),
    ]);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(commits).toBe(1);
    expect(stored.version).toBe(2);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(BotStepInProgressError);
  });

  it("fails closed when ownership and identity are absent in the legacy seam", async () => {
    const evaluate = vi.fn();
    await expect(stepTypesafeAction({ getHostToken: async () => null, getGame: async () => game, persistAIAction: vi.fn() },
      { evaluate }, "game-1")).rejects.toBeInstanceOf(BotStepForbiddenError);
    expect(evaluate).not.toHaveBeenCalled();
  });
});

describe("bot history validation before inference", () => {
  it.each(["version","history","database"] as const)("rejects %s failure before a provider call", async kind => {
    const initial=pokerEngineAdapter.startHand(pokerEngineAdapter.createGame({ smallBlind:1,bigBlind:2,
      players:[{ id:"human",seat:0,name:"Duplicate",controller:"human",stack:200,playerToken:"host" },
        { id:"bot",seat:1,name:"Duplicate",controller:"bot",stack:200 }] }),createDeterministicDeck());
    const current=pokerEngineAdapter.applyAction(initial,"human",{ type:"call",amount:1 });
    const evaluate=vi.fn();
    const persistAIAction=vi.fn();
    const getBotHandContext=vi.fn(async () => {
      if (kind === "database") throw new Error("Database failed");
      return { version:kind === "version" ? 2 : 1,handNumber:1,initialState:initial,actions:[] };
    });
    const promise=stepTypesafeAction({ getHostToken:async () => "host",getGame:async () => ({ id:"game-1",status:"playing",version:1,handNumber:1,stateSchemaVersion:1,currentState:current }),getBotHandContext,persistAIAction },{ evaluate },"game-1","host");
    await expect(promise).rejects.toThrow(kind === "database" ? "Database failed" : GameConflictError);
    expect(evaluate).not.toHaveBeenCalled();
    expect(persistAIAction).not.toHaveBeenCalled();
  });
});
