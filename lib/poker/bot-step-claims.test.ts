import { afterEach, describe, expect, it, vi } from "vitest";
import { withBotClaims } from "@/test/fixtures/bot-claims";
import { createDeterministicDeck, pokerEngineAdapter } from "./adapter";
import { BotStepForbiddenError } from "./driver-authorization";
import { stepBotAction } from "./bot-turn-service";
import { BotStepClaimLostError, BotStepInProgressError } from "./bot-step-claims";
import { emptyDiagnostics } from "@/lib/bots/types";
import { GameConflictError, type PersistAIActionInput, type PersistedGame } from "@/lib/supabase/queries";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function setup(provider: "rules" | "llm" | "typesafe" = "rules", hostToken = "owner") {
  const initial = pokerEngineAdapter.startHand(pokerEngineAdapter.createGame({
    smallBlind: 1, bigBlind: 2, players: [
      { id: "human", seat: 0, name: "Human", controller: "human", stack: 200, playerToken: "owner" },
      { id: "bot", seat: 1, name: "Bot", controller: "bot", stack: 200 },
    ],
  }), createDeterministicDeck());
  let stored: PersistedGame = { id: "game", status: "playing", currentState: pokerEngineAdapter.applyAction(initial, "human", { type: "call", amount: 1 }), stateSchemaVersion: 1, handNumber: 1, version: 1 };
  const repository = withBotClaims({
    getGame: async () => stored, getHostToken: async () => hostToken,
    persistAIAction: vi.fn(async (input: PersistAIActionInput) => {
      if (stored.version !== input.expectedVersion) throw new GameConflictError("game", input.expectedVersion);
      stored = { ...stored, currentState: input.currentState, version: stored.version + 1 };
      return stored;
    }),
  });
  const entered = deferred<void>();
  const response = deferred<void>();
  const decide = vi.fn(async () => {
    entered.resolve();
    await response.promise;
    return { action: { type: "check" as const }, diagnostics: emptyDiagnostics(), rawResponse: null };
  });
  const registry = { get: vi.fn(() => ({ bot: { decide }, descriptor: { id: "rules", label: "Rules", provider, modelId: null } })) };
  const step = (token = "owner") => stepBotAction(repository, registry, "game", 1, token);
  return { repository, registry, decide, entered, response, step };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("bot step claims", () => {
  it("only resolves a provider and infers once while another browser observes", async () => {
    const f = setup();
    const first = f.step();
    await f.entered.promise;
    await expect(f.step()).rejects.toBeInstanceOf(BotStepInProgressError);
    expect(f.registry.get).toHaveBeenCalledOnce();
    expect(f.decide).toHaveBeenCalledOnce();
    expect(f.repository.releaseBotStepClaim).not.toHaveBeenCalled();
    f.response.resolve();
    const result = await first;
    expect(result.game.version).toBe(2);
    const token = f.repository.acquireBotStepClaim.mock.calls[0][0].claimToken;
    expect(JSON.stringify(result)).not.toContain(token);
    expect(f.repository.persistClaimedAIAction).toHaveBeenCalledOnce();
    expect(f.repository.releaseBotStepClaim).toHaveBeenCalledOnce();
  });
  it("rejects stale versions before acquiring or resolving providers", async () => {
    const f = setup();
    await expect(stepBotAction(f.repository, f.registry, "game", 0, "owner")).rejects.toBeInstanceOf(GameConflictError);
    expect(f.repository.acquireBotStepClaim).not.toHaveBeenCalled();
    expect(f.registry.get).not.toHaveBeenCalled();
  });
  it("never acquires for unauthorized callers", async () => {
    const f = setup();
    await expect(f.step("spectator")).rejects.toBeInstanceOf(BotStepForbiddenError);
    expect(f.repository.acquireBotStepClaim).not.toHaveBeenCalled();
  });
  it("releases resolution and provider failures without masking them when cleanup fails", async () => {
    const f = setup();
    const failure = new Error("provider failed");
    f.registry.get.mockImplementationOnce(() => { throw failure; });
    await expect(f.step()).rejects.toBe(failure);
    expect(f.repository.releaseBotStepClaim).toHaveBeenCalledOnce();
    f.decide.mockRejectedValueOnce(failure);
    f.repository.releaseBotStepClaim.mockRejectedValueOnce(new Error("cleanup failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(f.step()).rejects.toBe(failure);
    expect(f.repository.persistClaimedAIAction).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("claimToken");
  });
  it("cannot commit an expired result even without takeover", async () => {
    vi.useFakeTimers();
    const f = setup();
    const first = f.step();
    const rejected = expect(first).rejects.toBeInstanceOf(BotStepClaimLostError);
    await f.entered.promise;
    vi.advanceTimersByTime(90_000);
    f.response.resolve();
    await rejected;
    expect(f.repository.persistAIAction).not.toHaveBeenCalled();
    expect(f.repository.releaseBotStepClaim).toHaveBeenCalledOnce();
  });
  it("fences a late result and its release after takeover, allowing only the new claimant to commit", async () => {
    vi.useFakeTimers();
    const f = setup();
    const first = f.step();
    const rejected = expect(first).rejects.toBeInstanceOf(BotStepClaimLostError);
    await f.entered.promise;
    vi.advanceTimersByTime(90_001);
    const secondResponse = deferred<void>();
    const secondEntered = deferred<void>();
    f.decide.mockImplementationOnce(async () => {
      secondEntered.resolve(); await secondResponse.promise;
      return { action: { type: "check" }, diagnostics: emptyDiagnostics(), rawResponse: null };
    });
    const second = f.step();
    await secondEntered.promise;
    f.response.resolve();
    await rejected;
    await expect(f.step()).rejects.toBeInstanceOf(BotStepInProgressError);
    secondResponse.resolve();
    expect((await second).game.version).toBe(2);
    expect(f.repository.persistAIAction).toHaveBeenCalledOnce();
  });
  it("cleanup failure cannot turn a successful action into failure", async () => {
    const f = setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    f.repository.releaseBotStepClaim.mockRejectedValueOnce(new Error("cleanup failed"));
    f.response.resolve();
    expect((await f.step()).game.version).toBe(2);
  });
});


describe("usage admission placement", () => {
  it("rules bots consume no external allowance", async () => {
    const f = setup(); f.response.resolve(); await f.step();
    expect(f.repository.admitExternalBotCall).not.toHaveBeenCalled();
  });
  it.each(["llm", "typesafe"] as const)("admits %s before inference, including failed providers", async provider => {
    const f = setup(provider);
    const failed = new Error("provider failure");
    f.decide.mockRejectedValueOnce(failed);
    await expect(f.step("owner")).rejects.toBe(failed);
    expect(f.repository.admitExternalBotCall).toHaveBeenCalledOnce();
    expect(f.repository.persistClaimedAIAction).not.toHaveBeenCalled();
    expect(f.repository.releaseBotStepClaim).toHaveBeenCalledOnce();
  });
  it("allowance denials release claims without inference or credit retirement", async () => {
    const f = setup("llm");
    const { UsageLimitError } = await import("@/lib/usage/errors");
    const denial = new UsageLimitError("OWNER_AI_LIMIT", 3600000);
    f.repository.admitExternalBotCall.mockRejectedValueOnce(denial);
    await expect(f.step()).rejects.toBe(denial);
    expect(f.decide).not.toHaveBeenCalled();
    expect(f.repository.persistClaimedAIAction).not.toHaveBeenCalled();
    expect(f.repository.releaseBotStepClaim).toHaveBeenCalledOnce();
  });
});


it("another owned seated browser can drive external bots without becoming the usage owner", async () => {
  const f = setup("typesafe", "durable-host");
  f.response.resolve();
  await expect(f.step("owner")).resolves.toMatchObject({ game: { version: 2 } });
  expect(f.repository.admitExternalBotCall).toHaveBeenCalledOnce();
  expect(f.repository.admitExternalBotCall.mock.calls[0]).toEqual([expect.objectContaining({ gameId: "game", expectedVersion: 1 })]);
});

it("locally rejected context consumes no allowance", async () => {
  const f = setup("llm");
  const repository = Object.assign(f.repository, { getBotHandContext: vi.fn().mockResolvedValue({ version: 2 }) });
  await expect(stepBotAction(repository, f.registry, "game", 1, "owner")).rejects.toBeInstanceOf(GameConflictError);
  expect(f.repository.admitExternalBotCall).not.toHaveBeenCalled();
  expect(f.decide).not.toHaveBeenCalled();
  expect(f.repository.releaseBotStepClaim).toHaveBeenCalledOnce();
});
