import type { Scenario } from "./harness";
import type { PokerAction } from "@/lib/poker/types";

const check = (seat: number) => ({ seat, action: { type: "check" } as PokerAction });
const call = (seat: number, amount: number) => ({ seat, action: { type: "call", amount } as PokerAction });
const bet = (seat: number, amount: number) => ({ seat, action: { type: "bet", amount } as PokerAction });
const raise = (seat: number, amount: number) => ({ seat, action: { type: "raise", amount } as PokerAction });
const huFlop = [call(0, 1), check(1)];
const huTurn = [...huFlop, check(1), check(0)];
const threeFlop = [call(0, 2), call(1, 1), check(2)];

/** Engine deals clockwise from seat 1 (heads-up too); burn cards are explicit. */
function deck(players: number, hero: number, hole: readonly string[], board: readonly string[]) {
  const pool = ["2c", "3d", "4h", "5s", "6c", "7d", "8h", "9s", "Tc", "Jd", "Qh", "Ks", "Ac", "2d", "3h", "4s", "5c", "6d", "7h", "8s"]
    .filter(card => !hole.includes(card) && !board.includes(card));
  const result: string[] = [];
  for (let round = 0; round < 2; round++) for (let offset = 1; offset <= players; offset++) {
    result.push(offset % players === hero ? hole[round] : pool.shift()!);
  }
  if (board.length) result.push(pool.shift()!, ...board.slice(0, 3));
  if (board.length >= 4) result.push(pool.shift()!, board[3]);
  return result;
}
function fixture(id: string, reason: string, stacks: number[], hero: number, hole: string[], board: string[],
  actions: Scenario["actions"], remaining: number[], pot: number, legal: string[],
  facts: Pick<Scenario["expected"], "callCost" | "contestablePotAfterCall"> = {}): Scenario {
  return { id, reason, stacks, hero, deck: deck(stacks.length, hero, hole, board), actions,
    expected: { street: board.length === 0 ? "preflop" : board.length === 3 ? "flop" : "turn", stacks: remaining, pot, legal, hole, board, ...facts },
    forbidden: legal.includes("check") ? ["fold"] : [],
    observation: "Legal calls, folds and aggression may be reasonable depending on ranges; sizing and sampled random-hand equity are informational.",
  };
}
export const everydayScenarios: readonly Scenario[] = [
  fixture("preflop-unopened-six", "Early-position suited broadway in an unopened six-seat pot.", [100, 100, 100, 100, 100, 100], 3, ["As", "Js"], [], [], [100, 99, 98, 100, 100, 100], 3, ["fold", "call", "raise"]),
  fixture("preflop-facing-open", "Big blind with a medium pair facing a button open at 50bb.", [100, 100, 100], 2, ["8c", "8d"], [], [raise(0, 6), { seat: 1, action: { type: "fold" } }], [94, 99, 98], 9, ["fold", "call", "raise"]),
  fixture("preflop-multiway-raised", "Suited connector in the big blind after a raise and a caller.", [200, 150, 120], 2, ["9h", "Th"], [], [raise(0, 8), call(1, 7)], [192, 142, 118], 18, ["fold", "call", "raise"]),
  fixture("preflop-short-stack", "Short small blind holding ace-high against an open.", [100, 12, 80], 1, ["Ad", "7c"], [], [raise(0, 6)], [94, 11, 78], 9, ["fold", "call", "raise"]),
  fixture("flop-free-check", "Weak unpaired holding can check for free on a dry flop.", [100, 100], 1, ["7s", "2h"], ["Kd", "9c", "4h"], huFlop, [98, 98], 4, ["fold", "check", "bet"]),
  fixture("flop-made-facing-bet", "Top pair with a good kicker facing a small flop bet.", [100, 100], 0, ["Ah", "Qd"], ["Ac", "8s", "3h"], [...huFlop, bet(1, 3)], [98, 95], 7, ["fold", "call", "raise"]),
  fixture("flop-draw-facing-bet", "Flush draw with overcards facing a pot-sized bet.", [150, 150], 0, ["Ah", "Jh"], ["9h", "4h", "2s"], [...huFlop, bet(1, 4)], [148, 144], 8, ["fold", "call", "raise"]),
  fixture("flop-multiway", "Middle pair on a connected flop after a bet and a call.", [100, 80, 120], 0, ["9c", "8c"], ["Td", "9h", "6s"], [...threeFlop, bet(1, 4), call(2, 4)], [98, 74, 114], 14, ["fold", "call", "raise"]),
  fixture("turn-draw-improvement", "A flop flush draw improves to a flush on the turn; further cards can still change the result.", [150, 150], 0, ["Kh", "Jh"], ["9h", "4h", "2s", "7h"], [...huTurn, bet(1, 4)], [148, 144], 8, ["fold", "call", "raise"]),
  fixture("turn-missed-draw-pressure", "Unpaired flush draw misses the turn and faces a large bet.", [100, 100], 0, ["Jh", "Th"], ["Ah", "4h", "2s", "8c"], [...huTurn, bet(1, 12)], [98, 86], 16, ["fold", "call", "raise"]),
  fixture("turn-short-unmatched", "Short top-pair caller cannot win the bettor's unmatched chips.", [12, 200], 0, ["Qc", "Js"], ["Qd", "8s", "3h", "2d"], [...huFlop, bet(1, 4), call(0, 4), bet(1, 194)], [6, 0], 206, ["fold", "call"], { callCost: 6, contestablePotAfterCall: 24 }),
  fixture("turn-multiway-side-pot", "One opponent is all-in; hero faces a bet into an additional side pot with a medium made hand.", [40, 10, 100], 0, ["Tc", "9c"], ["Td", "7s", "3h", "2d"], [raise(0, 6), call(1, 5), call(2, 4), bet(1, 4), call(2, 4), call(0, 4), bet(2, 20)], [30, 0, 70], 50, ["fold", "call", "raise"], { callCost: 20, contestablePotAfterCall: 70 }),
];
