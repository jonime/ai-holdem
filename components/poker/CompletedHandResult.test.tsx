import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import enUsGame from "@/lib/i18n/dictionaries/game/en-US";
import type { PublicPokerGame, PublicPokerPlayer } from "@/lib/poker/types";
import { CompletedHandResult } from "./CompletedHandResult";
import { I18nProvider } from "./I18nProvider";

const player: PublicPokerPlayer = {
  id: "winner", name: "Alice", controller: "human", aiDifficulty: null,
  seat: 0, status: "claimed", playerToken: null, isHost: true, leaving: false,
  inHand: true, committedStreet: 0, stack: 1100, folded: false, allIn: false,
  holeCards: null, bestHand: "flush",
};
const completed: PublicPokerGame = {
  handNumber: 1, seatCount: 2, smallBlind: 25, bigBlind: 50, startingStack: 1000,
  street: "complete", dealerSeat: 0, smallBlindSeat: 0, bigBlindSeat: 1,
  currentActorId: null, communityCards: [], pot: 0, completionReason: "fold",
  winnerIds: [player.id], winnerAmounts: { [player.id]: 150 },
  legalActions: [], players: [player],
};
function render(poker: PublicPokerGame) {
  return renderToStaticMarkup(<I18nProvider locale="en-US" dictionary={enUsGame}>
    <CompletedHandResult poker={poker} />
  </I18nProvider>);
}

describe("CompletedHandResult", () => {
  it("renders authoritative winnings without needing a feed, including on refresh", () => {
    const html = render(completed);
    expect(html).toContain("Alice wins 150");
    expect(html).toContain("Opponents folded.");
    expect(html).not.toContain("Flush");
    expect(render(JSON.parse(JSON.stringify(completed)))).toBe(html);
  });
  it("shows only public showdown categories", () => {
    expect(render({ ...completed, completionReason: "showdown" })).toContain("Flush");
    expect(render({ ...completed, completionReason: "showdown", players: [{ ...player, bestHand: null }] })).not.toContain("Flush");
  });
  it("lists multiple awards without claiming a split pot or calculating profit", () => {
    const html = render({ ...completed, completionReason: "showdown",
      players: [player, { ...player, id: "other", name: "Bob", bestHand: "straight" }],
      winnerIds: ["winner", "other"], winnerAmounts: { winner: 300, other: 700 },
    });
    expect(html).toContain("Pot awards");
    expect(html).toContain("Alice wins 300");
    expect(html).toContain("Bob wins 700");
    expect(html).not.toContain("Split pot");
    expect(html).not.toContain("Opponents folded");
  });
  it("clears when the next hand starts even if stale awards remain", () => {
    expect(render({ ...completed, handNumber: 2, street: "preflop" })).toBe("");
  });
});


describe("winning five", () => {
  const cards = ["As", "Ks", "Qs", "Js", "9s"];
  const winner = { ...player, holeCards: ["As", "Ks"], winningHand: { cards, playsBoard: false } };
  it("shows five cards and identifies both sources with neutral wording", () => {
    const html = render({ ...completed, completionReason: "showdown", players: [winner] });
    expect(html.match(/data-playing-card/g)).toHaveLength(5);
    expect(html.match(/data-hole-card="true"/g)).toHaveLength(2);
    expect(html).not.toContain("Gold underline");
    expect(html).toContain(", hole card");
    expect(html).toContain(", community card");
  });
  it("shows the board-only label without hole markers or legend", () => {
    const html = render({ ...completed, completionReason: "showdown", players: [
      { ...winner, winningHand: { cards, playsBoard: true } },
    ] });
    expect(html).toContain("Plays the board");
    expect(html).not.toContain("Gold underline");
    expect(html).not.toContain("data-hole-card");
  });
  it("stacks cards for each pot recipient and retains legacy fallbacks", () => {
    const html = render({ ...completed, completionReason: "showdown", players: [winner,
      { ...winner, id: "other", name: "Bob" }], winnerIds: ["winner", "other"], winnerAmounts: { winner: 300, other: 700 } });
    expect(html.match(/data-winning-hand/g)).toHaveLength(2);
    expect(html).toContain("Pot awards");
    expect(render({ ...completed, completionReason: "showdown" })).not.toContain("Winning five");
    expect(render({ ...completed, players: [winner] })).not.toContain("Winning five");
    expect(render({ ...completed, players: [winner], street: "preflop" })).toBe("");
  });
});
