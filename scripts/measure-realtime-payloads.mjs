// Synthetic six-seat fixture; UTF-8 JSON payload bytes exclude transport framing.
const gameId = "11111111-1111-4111-8111-111111111111";
const bot = { id: "equity-rules-v2", label: "Equity Rules", provider: "rules", modelId: null, configuration: { difficulty: true, playstyle: false } };
const game = {
  id: gameId, status: "playing", version: 42, viewerIsHost: false, publication: null,
  poker: {
    handNumber: 3, seatCount: 6, smallBlind: 50, bigBlind: 100, startingStack: 10000,
    street: "flop", dealerSeat: 0, smallBlindSeat: 1, bigBlindSeat: 2,
    currentActorId: "player-1", communityCards: ["As", "Kd", "2h"], pot: 600,
    completionReason: null, winnerIds: [], winnerAmounts: {}, botsShowUncontestedWins: false,
    legalActions: [], players: Array.from({ length: 6 }, (_, seat) => ({
      id: `player-${seat}`, name: seat === 0 ? "Player" : `Equity Rules #${seat}`,
      controller: seat === 0 ? "human" : "bot", bot: seat === 0 ? null : bot,
      aiDifficulty: seat === 0 ? null : "medium", botProfileId: null,
      seat, status: seat === 0 ? "claimed" : "bot", playerToken: null, isHost: seat === 0,
      leaving: false, inHand: true, committedStreet: 0, stack: 9900, folded: false,
      allIn: false, bestHand: null, cardsRevealed: false, holeCards: null,
    })),
  },
};
const seat = { gameId, seat: 0, name: "Player", status: "claimed", controller: "human", aiDifficulty: null, isHost: true, leaving: false, playerToken: null };
const aiDecision = { action: "check", amount: null, bot: { id: bot.id, label: bot.label, provider: bot.provider, modelId: bot.modelId }, botProfileId: null, probabilities: null, confidence: null, sizing: null, matchedRule: "check when free" };
for (const [type, contents, versioned] of [
  ["player_action", { game }, true],
  ["ai_decision", { game, aiDecision }, true],
  ["seat_name_updated", { game, seat }, false],
]) {
  const before = { type, gameId, version: game.version, ...contents };
  const after = { type, gameId, ...(versioned ? { version: game.version } : {}) };
  const oldBytes = Buffer.byteLength(JSON.stringify(before));
  const newBytes = Buffer.byteLength(JSON.stringify(after));
  console.log(`${type}: ${oldBytes} -> ${newBytes} bytes (${(100 * (1 - newBytes / oldBytes)).toFixed(2)}% smaller)`);
}
