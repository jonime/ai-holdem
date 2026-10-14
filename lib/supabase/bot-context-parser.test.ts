import { describe, expect, it } from "vitest";
import { pokerEngineAdapter } from "@/lib/poker/adapter";
import type { BotDescriptor } from "@/lib/poker/types";
import { parseBotHandContext } from "./bot-context-parser";

function context(bot: BotDescriptor) {
  const state = pokerEngineAdapter.startHand(pokerEngineAdapter.createGame({
    smallBlind: 50, bigBlind: 100, seatCount: 2,
    players: [
      { id: "human", seat: 0, name: "Human", controller: "human", stack: 1000, playerToken: "owner" },
      { id: "bot", seat: 1, name: "Bot", controller: "bot", stack: 1000, bot,
        aiDifficulty: bot.provider === "llm" ? null : "medium",
        botProfileId: bot.provider === "llm" ? "balanced" : null },
    ],
  }));
  return { version: 1, handNumber: 1, initialState: state, finalState: state,
    actions: [{ sequence: 1, action: "call", amount: 50, stateBefore: state }] };
}

describe("bot history descriptor validation", () => {
  it.each(["llm", "typesafe", "rules"] as const)("preserves %s catalog metadata in every historical state", provider => {
    const bot = { id: "test-bot", label: "Test bot", provider, modelId: provider === "rules" ? null : "test-model",
      configuration: { difficulty: provider !== "llm", playstyle: provider === "llm" } };
    const parsed = parseBotHandContext(context(bot));
    expect(parsed.initialState?.config.players[1].bot).toEqual(bot);
    expect(parsed.finalState?.config.players[1].bot).toEqual(bot);
    expect(parsed.actions[0].stateBefore?.config.players[1].bot).toEqual(bot);
  });

  it("accepts legacy descriptors without catalog metadata", () => {
    const bot = { id: "llm", label: "LLM", provider: "llm" as const, modelId: "test-model" };
    expect(parseBotHandContext(context(bot)).initialState?.config.players[1].bot).toEqual(bot);
  });

  it.each([
    { configuration: { difficulty: "false", playstyle: true } },
    { configuration: { difficulty: false } },
    { configuration: { difficulty: false, playstyle: true, unexpected: true } },
    { unexpected: true },
  ])("rejects malformed or unknown descriptor fields: %j", extra => {
    const data = context({ id: "llm", label: "LLM", provider: "llm", modelId: "test-model" });
    const raw = { ...data, initialState: { ...data.initialState, config: { ...data.initialState.config,
      players: data.initialState.config.players.map(player => player.bot ? { ...player, bot: { ...player.bot, ...extra } } : player) } } };
    expect(() => parseBotHandContext(raw)).toThrow();
  });
});
