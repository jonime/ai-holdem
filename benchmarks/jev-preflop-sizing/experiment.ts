import { createHash } from "node:crypto";
import { pokerEngineAdapter as engine, createDeterministicDeck } from "@/lib/poker/adapter";
import { createPokerAIState, type PokerAIDecisionHistoryItem } from "@/lib/poker/ai-state";
import { legacyDecisionHistory } from "@/lib/poker/bot-history";
import { createLegacySizingOptions } from "@/lib/typesafe/questions";
import { calculateShowdownEquity } from "@/lib/poker/equity";
import { OpeningAwareEquityRulesBot } from "@/lib/bots/equity-rules-opening";
import type { PokerGameState, PokerAction } from "@/lib/poker/types";
import { base, projectStep } from "../preflop-candidate/fixtures";
import { randomSource } from "../equity-rules/experiment";
import { cells, combinations, sizes, type Spec, type Selection, type Opponent, type Hero } from "./config";
import { conservative, scripted } from "./policies";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function materialize(spec: Spec) {
  const waiting = base(2, 100, spec.handNumber);
  const view = engine.decisionView(engine.startHand(waiting, createDeterministicDeck()));
  const heroSeat = view.currentActorSeat!, heroId = `p${heroSeat}`;
  if (heroSeat !== view.buttonSeat || heroSeat !== view.smallBlindSeat) throw new Error("Not button/small blind opening");
  const hole = [...combinations[spec.combo]].map(suit => spec.hand[0] + suit);
  const rest = createDeterministicDeck().map(c => c.rank + c.suit).filter(c => !hole.includes(c));
  const random = randomSource(createHash("sha256").update(spec.id).digest().readUInt32LE());
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const prefix = [0, 1].flatMap(round => view.postflopOrder.map(seat => seat === heroSeat ? hole[round] : rest.shift()!));
  const deck = [...prefix, ...rest];
  if (deck.length !== 52 || new Set(deck).size !== 52) throw new Error("Invalid deck");
  const state = engine.startHand(waiting, createDeterministicDeck(deck));
  const v = engine.decisionView(state);
  if (v.handNumber !== spec.handNumber || v.street !== "preflop" || v.players.some(p => p.stack + p.committedHand !== 200) || JSON.stringify(engine.heroCards(state, heroId)) !== JSON.stringify(hole)) throw new Error("Fixture mismatch");
  return { state, heroId, deckHash: hash(JSON.stringify(deck)), deck };
}
export function context(state: PokerGameState, history: readonly PokerAIDecisionHistoryItem[], stream: string, samples = 5000) {
  const actor = engine.snapshot(state).currentActorId!;
  const seat = engine.decisionView(state).currentActorSeat;
  // Production Rules projection, with only the equity seed replaced for common random numbers.
  const ai = createPokerAIState(state, actor, { difficulty: "medium", correctedContext: false, equitySamples: 1, historyStatus: "complete",
    decisionHistory: legacyDecisionHistory(history.map(a => ({ ...a, actor: a.actorSeat === seat ? "hero" : "opponent" }))) });
  const showdownEquity = calculateShowdownEquity({ heroHoleCards: ai.hero.holeCards, communityCards: ai.hand.communityCards,
    opponentCount: ai.situation!.activeOpponentCount, sampleCount: samples, seed: stream });
  const projected = { ...ai, analysis: { ...ai.analysis, showdownEquity, equitySamples: samples } };
  return { ...projected, sizingOptions: createLegacySizingOptions(projected) };
}
export function conserve(state: PokerGameState) {
  const v = engine.decisionView(state);
  if (v.players.some(p => !Number.isSafeInteger(p.stack) || p.stack < 0) || v.players.reduce((s, p) => s + p.stack, 0) + (v.street === "complete" ? 0 : v.pot) !== 400) throw new Error("Chip conservation failed");
}
export interface Outcome { valueBB: number; rootResponse: string; flop: boolean; showdown: boolean; heroLaterChips: number; opponentLaterChips: number; actions: number; terminalStacks: number[]; traceHash: string }
export async function rollout(fixture: ReturnType<typeof materialize>, spec: Spec, root: number, opponent: Opponent, hero: Hero, samples = 5000): Promise<Outcome> {
  let state = fixture.state, rootResponse = "none", flop = false;
  const startStack = engine.decisionView(state).players.find(p => p.id === fixture.heroId)!.stack;
  const history: PokerAIDecisionHistoryItem[] = [], visits = new Map<string, number>();
  const rules = new OpeningAwareEquityRulesBot();
  let heroLaterChips = 0, opponentLaterChips = 0;
  for (let count = 0; count <= 200; count++) {
    const snapshot = engine.snapshot(state), v = engine.decisionView(state);
    if (v.communityCards.length >= 3) flop = true;
    if (snapshot.street === "complete") {
      conserve(state);
      return { valueBB: (v.players.find(p => p.id === fixture.heroId)!.stack - startStack) / 2,
        rootResponse, flop, showdown: snapshot.completionReason === "showdown", heroLaterChips, opponentLaterChips,
        actions: count, terminalStacks: v.players.map(p => p.stack), traceHash: hash(JSON.stringify(history)) };
    }
    if (count === 200) throw new Error("Action limit exceeded");
    const actor = snapshot.currentActorId!, isHero = actor === fixture.heroId;
    let action: PokerAction;
    if (count === 0) action = { type: "raise", amount: root };
    else {
      const key = `${v.currentActorSeat}:${snapshot.street}`, visit = visits.get(key) ?? 0;
      visits.set(key, visit + 1);
      const input = context(state, history, `${spec.id}:equity:${key}:${visit}`, samples);
      action = count === 1 && opponent !== "rules" ? scripted(input, opponent, root)
        : isHero && hero === "conservative" ? conservative(input) : (await rules.decide(input)).action;
    }
    if (count === 1) rootResponse = `${action.type}:${"amount" in action ? action.amount ?? "" : ""}`;
    const before = state;
    state = engine.applyAction(state, actor, action);
    conserve(state);
    const step = projectStep(before, state, action, history.length + 1);
    if (count > 0) { if (isHero) heroLaterChips += step.payment ?? 0; else opponentLaterChips += step.payment ?? 0; }
    history.push(step);
  }
  throw new Error("Unreachable");
}
export interface Row { spec: Spec; deckHash: string; samples: number; outcomes: Record<string, Record<string, Outcome>>; failure: string | null; failedArm: string | null }
export async function evaluate(spec: Spec, selection: Selection = {}, samples = 5000, run = rollout): Promise<Row> {
  const fixture = materialize(spec), roots = spec.phase === "development" ? [200, ...sizes] : [200, selection[spec.hand]!];
  if (roots.some(r => ![4, 5, 6, 200].includes(r))) throw new Error("Missing confirmation selection");
  const row: Row = { spec, deckHash: fixture.deckHash, samples, outcomes: {}, failure: null, failedArm: null };
  let arm = "";
  try {
    for (const cell of cells) {
      row.outcomes[cell.id] = {};
      for (const root of roots) {
        arm = `${cell.id}/${root}`;
        row.outcomes[cell.id][root] = await run(fixture, spec, root, cell.opponent, cell.hero, samples);
      }
    }
  } catch (error) {
    row.outcomes = {}; row.failure = error instanceof Error ? error.message : "Rollout failed"; row.failedArm = arm;
  }
  return row;
}
