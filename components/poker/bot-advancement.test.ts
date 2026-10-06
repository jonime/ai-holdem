import { HttpError } from "@/lib/http/api";
import { GAME_VERSION_CONFLICT } from "@/lib/http/gameplay-contracts";
import { describe, expect, it, vi } from "vitest";
import { pokerEngineAdapter, createDeterministicDeck } from "@/lib/poker/adapter";
import { advanceBotTurns } from "./bot-advancement";
import { canAdvanceBots } from "./view-model";
import type { AIDecision, Game } from "./types";

const state = pokerEngineAdapter.startHand(pokerEngineAdapter.createGame({
  smallBlind: 50, bigBlind: 100,
  players: [
    { id: "human", name: "Human", controller: "human", seat: 0, stack: 1000, playerToken: "owner" },
    { id: "bot", name: "Bot", controller: "bot", seat: 1, stack: 1000 },
  ],
}), createDeterministicDeck());
const game: Game = { id: "game", status: "playing", version: 1, viewerIsHost: false,
  poker: pokerEngineAdapter.publicProjection(pokerEngineAdapter.applyAction(state, "human", { type: "call", amount: 50 }), "human") };
const aiDecision: AIDecision = { action: "check", amount: null, bot: { id: "rules", label: "Rules", provider: "rules", modelId: null },
  botProfileId: null, probabilities: null, confidence: null, sizing: null, matchedRule: null };
function driver() {
  return { viewerToken: () => "owner", isActive: () => true,
    step: vi.fn().mockResolvedValue({ game: { ...game, status: "complete" }, aiDecision }),
    apply: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined) };
}

describe("bot advancement", () => {
  it.each([null, "spectator"])("never steps for viewer %s", async token => {
    const d = { ...driver(), viewerToken: () => token };
    await advanceBotTurns(game, d);
    expect(d.step).not.toHaveBeenCalled();
  });
  it("keeps folded and eliminated owners and unseated hosts eligible", () => {
    for (const changes of [{ folded: true }, { stack: 0, inHand: false }]) {
      expect(canAdvanceBots({ ...game, poker: { ...game.poker,
        players: game.poker.players.map(p => p.id === "human" ? { ...p, ...changes } : p) } }, "owner")).toBe(true);
    }
    expect(canAdvanceBots({ ...game, viewerIsHost: true, poker: { ...game.poker,
      players: game.poker.players.filter(p => p.controller === "bot") } }, "host")).toBe(true);
    expect(canAdvanceBots({ ...game, viewerIsHost: true }, null)).toBe(false);
  });
  it("refreshes conflicts silently and ends the stale loop", async () => {
    const d = driver();
    d.step.mockRejectedValue(new HttpError("Game version conflict", 409, GAME_VERSION_CONFLICT));
    await advanceBotTurns(game, d);
    expect(d.refresh).toHaveBeenCalledOnce();
    expect(d.step).toHaveBeenCalledOnce();
    expect(d.apply).not.toHaveBeenCalled();
  });
  it("uses the conflict code independently of its message", async () => {
    const d = driver();
    d.step.mockRejectedValue(new HttpError("Changed message", 409, GAME_VERSION_CONFLICT));
    await advanceBotTurns(game, d);
    expect(d.refresh).toHaveBeenCalledOnce();
    expect(d.apply).not.toHaveBeenCalled();
  });
  it.each([
    new HttpError("It is not a bot turn", 409),
    new HttpError("Game version conflict", 409),
    new HttpError("Game version conflict", 409, "UNRELATED_CONFLICT"),
    new HttpError("AI decision failed", 502),
    new HttpError("Game version conflict", 502),
  ])("keeps unrelated failures visible: %s", async error => {
    const d = driver();
    d.step.mockRejectedValue(error);
    await expect(advanceBotTurns(game, d)).rejects.toBe(error);
    expect(d.refresh).not.toHaveBeenCalled();
  });
  it("retains refresh and provider failures", async () => {
    const d = driver();
    d.step.mockRejectedValue(new HttpError("Game version conflict", 409, GAME_VERSION_CONFLICT));
    d.refresh.mockRejectedValue(new Error("Refresh failed"));
    await expect(advanceBotTurns(game, d)).rejects.toThrow("Refresh failed");
    d.step.mockRejectedValue(new Error("AI decision failed"));
    await expect(advanceBotTurns(game, d)).rejects.toThrow("AI decision failed");
  });
  it.each(["navigation", "eligibility"])("stops a pending loop after %s", async () => {
    let active = true;
    const d = { ...driver(), isActive: () => active };
    d.step.mockImplementation(async () => {
      active = false;
      return { game, aiDecision };
    });
    await advanceBotTurns(game, d);
    expect(d.step).toHaveBeenCalledOnce();
    expect(d.apply).not.toHaveBeenCalled();
  });
  it("checks returned ownership before another iteration", async () => {
    const d = driver();
    d.step.mockResolvedValue({ game: { ...game, poker: { ...game.poker,
      players: game.poker.players.map(p => ({ ...p, playerToken: null })) } }, aiDecision });
    await advanceBotTurns(game, d);
    expect(d.step).toHaveBeenCalledOnce();
  });
  it.each(["human", "complete"])("stops when the turn becomes %s", async turn => {
    const d = driver();
    d.step.mockResolvedValue({ game: { ...game, poker: { ...game.poker,
      street: turn === "complete" ? "complete" : "flop", currentActorId: turn === "human" ? "human" : "bot" } }, aiDecision });
    await advanceBotTurns(game, d);
    expect(d.step).toHaveBeenCalledOnce();
  });
  it("bounds a continuing bot loop to twelve requests", async () => {
    const d = driver();
    d.step.mockResolvedValue({ game, aiDecision });
    await advanceBotTurns(game, d);
    expect(d.step).toHaveBeenCalledTimes(12);
    expect(d.apply).toHaveBeenCalledTimes(12);
  });
  it("discards a deferred response after invalidation", async () => {
    let active = true;
    let resolve!: (value: { game: Game; aiDecision: AIDecision }) => void;
    const d = { ...driver(), isActive: () => active };
    d.step.mockImplementation(() => new Promise(r => { resolve = r; }));
    const pending = advanceBotTurns(game, d);
    active = false;
    resolve({ game, aiDecision });
    await pending;
    expect(d.apply).not.toHaveBeenCalled();
    expect(d.step).toHaveBeenCalledOnce();
  });

});
