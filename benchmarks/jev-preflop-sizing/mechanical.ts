import { pokerEngineAdapter as engine, createDeterministicDeck } from "@/lib/poker/adapter";
import { createPokerAIState } from "@/lib/poker/ai-state";
import { createLegacySizingOptions } from "@/lib/typesafe/questions";
import { base } from "../preflop-candidate/fixtures";
import { configuration, allocation, combinations, hands, handNumbers } from "./config";
import { materialize, conserve } from "./experiment";
import { classes, classify, scripted, responseClass, conservative } from "./policies";
/** Deterministic mechanical fixture, not a sampled study block. */
export function responseFixture(notation: string, root: number) {
  const cards = notation.length === 2 ? [notation[0] + "s", notation[1] + "h"] : [notation[0] + "s", notation[1] + (notation.endsWith("s") ? "s" : "h")];
  const waiting = base(2), v = engine.decisionView(engine.startHand(waiting, createDeterministicDeck()));
  const heroId = `p${v.currentActorSeat}`, otherId = v.players.find(p => p.id !== heroId)!.id;
  const available = createDeterministicDeck().map(c => c.rank + c.suit).filter(c => !cards.includes(c));
  const hero = available.splice(0, 2);
  const prefix = [0, 1].flatMap(round => v.postflopOrder.map(seat => `p${seat}` === heroId ? hero[round] : cards[round]));
  const initial = engine.startHand(waiting, createDeterministicDeck([...prefix, ...available]));
  const state = engine.applyAction(initial, heroId, { type: "raise", amount: root });
  const ai = createPokerAIState(state, otherId, { equitySamples: 1, difficulty: "medium" });
  return { initial, state, heroId, otherId, input: { ...ai, sizingOptions: createLegacySizingOptions(ai) } };
}
export async function mechanicalChecks() {
  let fixtures = 0, responses = 0;
  for (const hand of hands) for (let combo = 0; combo < combinations.length; combo++) for (const handNumber of handNumbers) {
    const spec = { ...allocation("development")[0], hand, combo, handNumber, id: `mechanical:${hand}:${combo}:${handNumber}` };
    const f = materialize(spec), again = materialize(spec);
    if (f.deckHash !== again.deckHash || JSON.stringify(f.deck) !== JSON.stringify(again.deck)) throw new Error("Pairing mismatch");
    for (const amount of configuration.roots) {
      const state = engine.applyAction(f.state, f.heroId, { type: "raise", amount });
      const p = engine.decisionView(state).players.find(p => p.id === f.heroId)!;
      if (p.stack !== 200 - amount || p.committedStreet !== amount) throw new Error("Total opening amount mismatch");
      conserve(state);
    }
    fixtures++;
  }
  if (classes.length !== 169 || new Set(classes).size !== 169) throw new Error("Response table incomplete");
  for (const notation of classes) for (const root of configuration.roots) {
    const f = responseFixture(notation, root);
    if (classify(f.input.hero.holeCards) !== notation) throw new Error("Classification mismatch");
    for (const policy of ["selective", "loose"] as const) {
      const action = scripted(f.input, policy, root);
      if (action.type !== responseClass(policy, notation, root === 200)) throw new Error("Response mismatch");
      if (action.type === "call" && action.amount !== root - 2) throw new Error("Call payment mismatch");
      const after = engine.applyAction(f.state, f.otherId, action);
      conserve(after);
      if (action.type === "raise" && (action.amount !== 3 * root || engine.decisionView(after).players.find(p => p.id === f.otherId)!.stack !== 200 - 3 * root)) throw new Error("Re-raise amount mismatch");
      if (root === 200 && engine.snapshot(after).street !== "complete") throw new Error("Shove did not finish");
      if (action.type === "fold" && root === 200 && engine.decisionView(after).players.find(p => p.id === f.heroId)!.stack !== 202) throw new Error("Uncalled shove refund missing");
      responses++;
    }
  }
  const input = responseFixture("72o", 4).input;
  if (conservative({ ...input, legalActions: [{ type: "check" }], analysis: { ...input.analysis, showdownEquity: 1 } }).type !== "check") throw new Error("Conservative free check failed");
  return { fixtures, engineValidatedResponses: responses, classes: classes.length, roots: configuration.roots, passed: true };
}
