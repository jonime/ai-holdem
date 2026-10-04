import { pokerEngineAdapter, createDeterministicDeck } from "@/lib/poker/adapter";
import type { GameplayGame, GameplayAIDecision } from "@/lib/http/gameplay-contracts";

const state = pokerEngineAdapter.startHand(pokerEngineAdapter.createGame({
  smallBlind: 50, bigBlind: 100,
  players: [
    { id: "human", name: "Human", controller: "human", seat: 0, stack: 1000, playerToken: "owner" },
    { id: "bot", name: "Bot", controller: "bot", seat: 1, stack: 1000 },
  ],
}), createDeterministicDeck());
export const gameplayGame: GameplayGame = {
  id: "game-1", status: "playing", version: 2, viewerIsHost: true,
  poker: pokerEngineAdapter.publicProjection(state, "human"),
};
export const gameplayDecision: GameplayAIDecision = {
  action: "call", amount: 50, bot: { id: "rules", label: "Rules", provider: "rules", modelId: null },
  botProfileId: null, probabilities: null, confidence: null, sizing: null, matchedRule: null,
};
