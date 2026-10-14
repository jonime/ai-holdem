import { deck, type OpponentRange, type RangeEquityInput } from "./calculator";

export const FIXTURE_VERSION = "range-hypotheses-v1";
export const uniformRange: OpponentRange = {
  provenance: `${FIXTURE_VERSION}:uniform-all-combinations`,
  combinations: deck.flatMap((first, index) => deck.slice(index + 1).map(second => ({ cards: [first, second], weight: 1 }))),
};
function range(name: string, holdings: string[], weights?: number[]): OpponentRange {
  return { provenance: `${FIXTURE_VERSION}:${name}`, combinations: holdings.map((cards, index) => ({
    cards: [cards.slice(0, 2), cards.slice(2)], weight: weights?.[index] ?? 1,
  })) };
}
const narrow = range("premium-preflop-hypothesis", ["AcAd", "AcAs", "AdAs", "KcKh", "KsKh", "QcQh", "QsQh", "AcKc", "AdKd", "AsKs"]);
const value = range("value-heavy-postflop-hypothesis", ["QcQh", "QsQh", "9c9h", "9s9h", "2d2h", "Qh9h"]);
const draws = range("draw-heavy-postflop-hypothesis", ["AcKc", "AcJc", "KcJc", "JcTc", "8c7c", "JhTh"]);
export interface RangeFixture { id: string; input: RangeEquityInput; oracle: boolean }
function fixture(id: string, hero: string[], board: string[], opponents: OpponentRange[], oracle = true): RangeFixture {
  return { id, input: { hero, board, opponents, seed: `${FIXTURE_VERSION}:${id}`, sampleBudget: 5_000 }, oracle };
}
export const fixtures: readonly RangeFixture[] = [
  fixture("preflop-broad", ["Ah", "Kd"], [], [uniformRange]),
  fixture("preflop-narrow", ["Ah", "Kd"], [], [narrow]),
  fixture("flop-value", ["Ah", "Qd"], ["Qc", "9d", "2c"], [value]),
  fixture("flop-draw", ["Ah", "Qd"], ["Qc", "9d", "2c"], [draws]),
  fixture("turn-known", ["Ah", "Ad"], ["As", "7d", "2c", "Qc"], [range("known-pair", ["KhKd"])]),
  fixture("river-blockers", ["Ah", "Kd"], ["As", "7d", "2c", "Qc", "9h"], [range("blocker-test", ["AhAd", "AsAc", "KhKs", "QhQd", "8h8d"])]),
  fixture("river-board-tie", ["2c", "3d"], ["Ah", "Kh", "Qh", "Jh", "Th"], [uniformRange, uniformRange]),
  fixture("river-known-nuts", ["Ah", "Kh"], ["Qh", "Jh", "Th", "2c", "3d"], [range("known-loser", ["AcAd"])]),
  fixture("river-weighted-joint", ["Ah", "Ad"], ["2c", "3d", "7h", "9s", "Jc"], [
    range("weighted-one", ["KhKd", "QhQd"], [1, 3]),
    range("weighted-two", ["KhKs", "JhJd"], [2, 1]),
  ], false),
  ...[2, 3, 4, 5].map(count => fixture(`uniform-${count}-opponents`, ["Ah", "Kd"], ["Qc", "9d", "2c", "4h"], Array.from({ length: count }, () => uniformRange))),
];
