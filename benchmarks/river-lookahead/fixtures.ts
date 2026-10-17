import { evaluateVisibleCards, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { createLegacySizingOptions } from "@/lib/typesafe/questions";
import type { OpponentRange } from "../range-equity/calculator";
import { deck } from "../range-equity/calculator";
import { contexts, holdingKey, key, replay, type Decision } from "./decision";
import type { ResponseModel } from "./evaluator";
export interface Fixture { id: string; decision: Decision; actualOpponent: readonly string[]; ranges: OpponentRange[]; models: ResponseModel[] }
const specifications = [
  ["value", "As Ah", "Ac 7d 4c 2h 9s"], ["thin-value", "As Qh", "Qc 7d 4c 2h 9s"],
  ["bluff-catching", "8s 8h", "Ac 7d 4c 2h 9s"], ["missed-draw", "Js Ts", "As 9s 4c 2h 6d"],
  ["blocker", "As Jh", "Ks 9s 4s 2h 6d"], ["paired", "Qs Qh", "Kc Kd 4c 2h 9s"],
  ["coordinated", "9h 8h", "Jh Tc 7c 2h 6d"], ["forced-split", "2c 3d", "As Ks Qs Js Ts"],
  ["all-in-win", "As Ah", "Ac Ad 7c 4h 2d"], ["all-in-split", "2c 3d", "As Ks Qs Js Ts"],
  ["all-in-loss", "2c 3d", "Ac Kd Qh 8s 7c"], ["all-in-marginal", "As Jh", "Ac Kd Qh 8s 7c"],
];
function ownStrength(cards: readonly string[], board: readonly string[]) {
  const rank = evaluateVisibleCards(cards, board);
  return ["high-card", "one-pair", "two-pair", "three-of-a-kind", "straight", "flush", "full-house", "four-of-a-kind", "straight-flush"].indexOf(rank.category ?? "");
}
export function makeFixtures(): Fixture[] {
  return specifications.map(([id, hole, board], index) => {
    const hero = hole.split(" ") as [string, string], river = board.split(" ") as Decision["board"];
    const stacks: [number, number] = index % 2 === 0 ? [120, 80] : [80, 120];
    const history: Decision["history"] = [
      { sequence: 1, seat: 0, street: "preflop", action: { type: "raise", amount: 10 } },
      { sequence: 2, seat: 1, street: "preflop", action: { type: "call" } },
      { sequence: 3, seat: 1, street: "flop", action: { type: "check" } },
      { sequence: 4, seat: 0, street: "flop", action: { type: "bet", amount: 10 } },
      { sequence: 5, seat: 1, street: "flop", action: { type: "call" } },
      { sequence: 6, seat: 1, street: "turn", action: { type: "check" } },
      { sequence: 7, seat: 0, street: "turn", action: { type: "check" } },
      { sequence: 8, seat: 1, street: "river", action: index < 8 ? { type: "check" } : { type: "bet", amount: stacks[1] - 20 } },
    ];
    const decision: Decision = { version: "river-decision-v1", dealtPlayers: 2, rake: 0, sidePots: false,
      hero, board: river, stacks, smallBlind: 1, bigBlind: 2, history };
    // Six canonical representatives spanning public made-hand strength.
    // No hidden deal, baseline decision or session statistic participates in construction.
    const available = deck.filter(c => ![...hero, ...river].includes(c));
    const strengths = new Map<string, number>();
    const strength = (cards: string[]) => { const k = holdingKey(cards); if (!strengths.has(k)) strengths.set(k, ownStrength(cards, river)); return strengths.get(k)!; };
    let holdings = available.flatMap((a, i) => available.slice(i + 1).map(b => [a, b]))
      .sort((a, b) => strength(a) - strength(b) || holdingKey(a).localeCompare(holdingKey(b)));
    if (id === "all-in-loss") holdings = holdings.filter(c => strength(c) >= 1);
    const chosen = Array.from({ length: 6 }, (_, i) => holdings[Math.floor(i * (holdings.length - 1) / 5)]);
    const ranges = ["broad", "value-heavy", "polarized"].map(name => ({ provenance: `synthetic-post-line-v1/${id}/${name}`,
      combinations: chosen.map((cards, i) => ({ cards, weight: name === "broad" ? 1 : name === "value-heavy" ? [1, 1, 2, 4, 8, 16][i] : [12, 6, 1, 1, 6, 12][i] })) }));
    const run = replay(decision, chosen[0]);
    const ai = contexts(run, "medium").baseline;
    const sizes = [...new Set([...contexts(run, "medium").menu, ...createLegacySizingOptions(ai)].flatMap(s => s.amount === null ? [] : [s.amount]))];
    const models: ResponseModel[] = index >= 8 ? [] : ["fold-prone", "call-heavy", "raise-capable"].map(profile => ({
      version: `synthetic-responses-v1/${profile}`, provenance: "Original synthetic holding-category and public bet/pot pressure table; no empirical calibration",
      rows: chosen.flatMap(holding => sizes.map(amount => {
        const after = engine.applyAction(run.state, "p0", { type: "bet", amount });
        const canRaise = engine.getLegalActions(after).some(a => a.type === "raise");
        const strong = ownStrength(holding, river) >= 2;
        const pressure = amount >= 40;
        const fold = profile === "fold-prone" ? (strong ? .1 : pressure ? .8 : .65) : profile === "call-heavy" ? (strong ? .02 : pressure ? .2 : .1) : (strong ? .05 : pressure ? .55 : .35);
        const raise = profile === "raise-capable" && canRaise ? (strong ? .65 : pressure ? .15 : .3) : 0;
        return { holding, action: key({ type: "bet", amount }), probabilities: { fold, call: 1 - fold - raise, raise } };
      })),
    }));
    return { id, decision, actualOpponent: chosen[2], ranges, models };
  });
}
