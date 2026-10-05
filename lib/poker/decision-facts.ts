import "server-only";
import { evaluateVisibleCards } from "./adapter";
import type { PokerAIState, PokerAIDecisionHistoryItem } from "./ai-state";

export const pokerAnalysisVersion = "poker-facts-v1";
const ranks = "23456789TJQKA";
const value = (card: string) => ranks.indexOf(card[0]) + 2;
const counts = (items: readonly string[]) => items.reduce<Record<string, number>>((result, item) => {
  result[item] = (result[item] ?? 0) + 1; return result;
}, {});
function straightWindows(cards: readonly string[]) {
  const values = new Set(cards.map(value));
  if (values.has(14)) values.add(1);
  return Array.from({ length: 10 }, (_, i) => {
    const window = Array.from({ length: 5 }, (_, j) => i + 1 + j);
    return { window, missing: window.filter(n => !values.has(n)) };
  });
}
export interface ActionLineFact {
  readonly sequence: number;
  readonly seat: number;
  readonly street: string;
  readonly labels: readonly string[];
}

function actionLines(history: readonly PokerAIDecisionHistoryItem[]): readonly ActionLineFact[] {
  const result: ActionLineFact[] = [];
  let initiative: number | null = null;
  let previousStreetAggressor: number | null = null;
  let previousStreetCheckedThrough = false;
  const preflopAggressor = history.filter(e => e.street === "preflop" && (e.action === "raise" || e.action === "bet")).at(-1)?.actorSeat ?? null;
  for (const street of ["preflop", "flop", "turn", "river"]) {
    const events = history.filter(e => e.street === street);
    let aggressor: number | null = null;
    const checked = new Set<number>();
    for (const event of events) {
      if (event.actorSeat === null) continue;
      const labels: string[] = [];
      if (event.action === "check") {
        checked.add(event.actorSeat);
        if (event.actorSeat === initiative) labels.push("previous_aggressor_checking");
      }
      if (event.action === "bet" || event.action === "raise") {
        if (street !== "preflop") {
          if (event.action === "raise" && checked.has(event.actorSeat)) labels.push("check_raise");
          if (event.action === "bet") {
            if (street === "flop" && preflopAggressor === event.actorSeat) labels.push("continuation_bet");
            else if (street !== "flop" && previousStreetAggressor === event.actorSeat) labels.push("repeated_barrel");
            else if (street === "turn" && previousStreetCheckedThrough && preflopAggressor === event.actorSeat) labels.push("delayed_continuation_bet");
            else if (initiative !== null && initiative !== event.actorSeat &&
                     (previousStreetCheckedThrough || checked.has(initiative))) labels.push("probe");
            else if (initiative !== null && initiative !== event.actorSeat) labels.push("donk_bet");
          }
        }
        aggressor = event.actorSeat;
      }
      if (labels.length) result.push({ sequence: event.sequence, seat: event.actorSeat, street, labels });
    }
    previousStreetAggressor = aggressor;
    previousStreetCheckedThrough = street !== "preflop" && events.length > 0 && aggressor === null;
    initiative = aggressor ?? initiative;
  }
  return result;
}

export function analyzePokerDecision(context: PokerAIState) {
  const hole = context.hero.holeCards, board = context.hand.communityCards;
  const visible = [...hole, ...board];
  const made = evaluateVisibleCards(hole, board);
  const suitCounts = counts(visible.map(c => c[1]));
  const boardSuits = counts(board.map(c => c[1]));
  const windows = straightWindows(visible);
  const future = board.length === 3 || board.length === 4;
  const straightMade = windows.some(w => w.missing.length === 0);
  const completionValues = [...new Set(windows.filter(w => w.missing.length === 1).flatMap(w => w.missing).map(n => n === 1 ? 14 : n))];
  const flushDrawSuits = future && !Object.values(suitCounts).some(n => n >= 5)
    ? Object.entries(suitCounts).filter(([, n]) => n === 4).map(([suit]) => suit) : [];
  const pressure = context.opponents.map(opponent => ({
    seat: opponent.seat,
    streets: ["preflop", "flop", "turn", "river"].map(street => {
      const events = context.actionHistory.filter(e => e.actorSeat === opponent.seat && e.street === street && (e.action === "bet" || e.action === "raise"));
      return { street, events: events.map(e => ({ sequence: e.sequence, payment: e.payment ?? null,
        commitment: e.commitment ?? null, potBefore: e.potBefore ?? null,
        raiseIncrement: e.raiseIncrement ?? null, potFraction: e.pressureRatio ?? null,
        activeSeats: e.activeSeats ?? [] })),
        totalPotFractions: context.situation?.historyStatus === "complete" && events.every(e => e.pressureRatio !== undefined) ? events.reduce((sum,e) => sum + (e.pressureRatio ?? 0), 0) : null };
    }),
  }));
  const sortedHole = [...hole].sort((a,b) => value(b)-value(a));
  const pair = hole[0]?.[0] === hole[1]?.[0];
  const suited = hole[0]?.[1] === hole[1]?.[1];
  const gap = Math.abs(value(hole[0]) - value(hole[1]));
  return {
    version: pokerAnalysisVersion,
    startingHand: { notation: sortedHole.map(c => c[0]).join("") + (pair ? "" : suited ? "s" : "o"),
      pair, suited, rankGap: gap, connected: gap === 1 || (sortedHole[0][0] === "A" && sortedHole[1][0] === "2") },
    madeHand: { ...made, holeCardsInBestFive: made.boardOnly ? [] : made.bestFive.filter(c => hole.includes(c)),
      // Full engine tiebreak vector includes made ranks followed by kickers.
      rankAndKickerValues: made.tiebreak,
      kickers: made.category === "one-pair" || made.category === "three-of-a-kind" || made.category === "four-of-a-kind" ? made.tiebreak.slice(1) : made.category === "two-pair" ? made.tiebreak.slice(2) : made.category === "high-card" ? made.tiebreak : [],
      boardCardsInBestFive: made.bestFive.filter(c => board.includes(c)) },
    board: { rankCounts: counts(board.map(c => c[0])), paired: Object.values(counts(board.map(c => c[0]))).some(n => n >= 2),
      suitCounts: boardSuits, maximumSuitConcentration: Math.max(0, ...Object.values(boardSuits)),
      maximumStraightWindowRanks: Math.max(0, ...straightWindows(board).map(w => 5-w.missing.length)) },
    draws: {
      flushDrawSuits,
      flushDrawUsesHoleCards: flushDrawSuits.some(suit => hole.some(c => c[1] === suit)),
      straightCompletionRanks: future && !straightMade ? completionValues.sort((a,b) => a-b).map(n => ranks[n-2]) : [],
      straightDrawUsesHoleCards: future && !straightMade && windows.some(w => w.missing.length === 1 && hole.some(c => !board.some(b => value(b) === value(c)) && (w.window.includes(value(c)) || (value(c) === 14 && w.window.includes(1))))),
      backdoorFlushSuits: board.length === 3 && flushDrawSuits.length === 0 && !Object.values(suitCounts).some(n => n >= 5)
        ? Object.entries(suitCounts).filter(([,n]) => n === 3).map(([suit]) => suit) : [],
      backdoorStraight: board.length === 3 && !straightMade && completionValues.length === 0 && windows.some(w => w.missing.length === 2),
    },
    blockers: { visibleRankCounts: counts(visible.map(c => c[0])), heroSuitCards: counts(hole.map(c => c[1])),
      note: "Card removal facts only; opponent holdings and ranges are unknown." },
    historyStatus: context.situation?.historyStatus ?? "unknown",
    actionLines: context.situation?.historyStatus === "complete" ? actionLines(context.actionHistory) : [],
    pressure,
    pressureHistoryComplete: context.situation?.historyStatus === "complete",
    pressureMeaning: "Individual observed pot fractions and their sums; not equity or a calibrated strategic score.",
  } as const;
}
export type PokerDecisionFacts = ReturnType<typeof analyzePokerDecision>;
