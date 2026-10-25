import { describe, expect, it } from "vitest";
import { gameplayGame } from "@/test/fixtures/gameplay";
import { foldDecision, sameFoldDecision } from "./fold-confirmation";
import { observeTurnClock } from "./turn-clock";
import type { Game } from "./types";

const game: Game = { ...gameplayGame, poker: { ...gameplayGame.poker, legalActions: [{ type: "fold" }, { type: "check" }] } };
const decision = () => foldDecision(game, "owner", false)!;

describe("free-check fold decisions", () => {
  it("captures only owned, legal free-check decisions and accepts identical refreshes", () => {
    expect(decision()).toEqual({ gameId: game.id, version: game.version, handNumber: game.poker.handNumber, actorId: "human" });
    expect(sameFoldDecision(decision(), foldDecision(structuredClone(game), "owner", false))).toBe(true);
    expect(foldDecision(gameplayGame, "owner", false)).toBeNull();
    for (const type of ["check", "fold"] as const) {
      expect(foldDecision({ ...game, poker: { ...game.poker, legalActions: [{ type }] } }, "owner", false)).toBeNull();
    }
  });
  it("rejects blocked recovery, lost ownership, departure, completion and missing games", () => {
    expect(foldDecision(game, "owner", true)).toBeNull();
    expect(foldDecision(game, null, false)).toBeNull();
    expect(foldDecision(game, "spectator", false)).toBeNull();
    expect(foldDecision(null, "owner", false)).toBeNull();
    expect(foldDecision({ ...game, status: "complete" }, "owner", false)).toBeNull();
    expect(foldDecision({ ...game, poker: { ...game.poker, seats: game.poker.players.map(p => ({ ...p, playerToken: null })) } }, "owner", false)).toBeNull();
    expect(foldDecision({ ...game, poker: { ...game.poker, players: game.poker.players.map(p => ({ ...p, leaving: true })) } }, "owner", false)).toBeNull();
  });
  it("rejects game, hand, version and actor changes", () => {
    const captured = decision();
    for (const changed of [{ ...captured, gameId: "other" }, { ...captured, handNumber: 20 },
      { ...captured, version: 99 }, { ...captured, actorId: "other" }, null]) {
      expect(sameFoldDecision(captured, changed)).toBe(false);
    }
    expect(foldDecision({ ...game, poker: { ...game.poker, currentActorId: "bot" } }, "owner", false)).toBeNull();
  });
  it("rejects elapsed authoritative deadlines without a remote update", () => {
    const timed = { ...game, serverTime: "2026-01-01T00:00:00Z", turnTimer: {
      decisionId: "id", actorEngineId: "human", handNumber: 1, deadline: "2026-01-01T00:00:01Z",
    } };
    observeTurnClock(timed, performance.now() - 2000);
    expect(foldDecision(timed, "owner", false)).toBeNull();
  });
});
