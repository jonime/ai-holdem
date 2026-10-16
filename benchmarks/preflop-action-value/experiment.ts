import { createHash } from "node:crypto";
import { pokerEngineAdapter as engine, createDeterministicDeck } from "@/lib/poker/adapter";
import { createPokerAIState, type PokerAIDecisionHistoryItem } from "@/lib/poker/ai-state";
import { legacyDecisionHistory, projectBotHistory } from "@/lib/poker/bot-history";
import { createLegacySizingOptions } from "@/lib/typesafe/questions";
import { EquityRulesV2Bot } from "@/lib/bots/equity-rules-v2";
import type { BotContext, PokerBot } from "@/lib/bots/types";
import type { PokerAction, PokerGameState, AIDifficulty } from "@/lib/poker/types";
import { opponentBot, randomSource, bootstrapInterval, type Opponent } from "../equity-rules/experiment";

export const version = "preflop-action-value-v1";
export const hands = { AA: ["As", "Ah"], KK: ["Ks", "Kh"], QQ: ["Qs", "Qh"], AKs: ["As", "Ks"], AKo: ["As", "Kh"] } as const;
export type Hand = keyof typeof hands;
export interface Group { hand: Hand; seats: 2 | 6; opponent: Opponent; difficulty: AIDifficulty; samples: number; seeds: number; }
export const groups: Group[] = [100, 1000].flatMap(samples => (Object.keys(hands) as Hand[]).flatMap(hand =>
  ([2, 6] as const).flatMap(seats => (["frozen", "passive", "aggressive"] as const).flatMap(opponent =>
    (["easy", "medium", "hard"] as const).map(difficulty => ({ hand, seats, opponent, difficulty, samples, seeds: samples === 100 ? 500 : 100 }))))));

export function deal(hand: Hand, seats: 2 | 6, seed: number) {
  const waiting = engine.createGame({ smallBlind: 1, bigBlind: 2, seatCount: seats,
    players: Array.from({ length: seats }, (_, seat) => ({ id: `p${seat}`, name: `Seat ${seat}`, seat, controller: "bot" as const, stack: 200 })) });
  const view = engine.decisionView(engine.startHand(waiting, createDeterministicDeck()));
  const heroSeat = view.currentActorSeat!;
  if (view.players.find(p => p.seat === heroSeat)?.position !== (seats === 2 ? "button" : "UTG")) throw new Error("Wrong opening actor");
  const hole: readonly string[] = hands[hand];
  const random = randomSource(createHash("sha256").update(`${version}:${hand}:${seats}:${seed}`).digest().readUInt32LE());
  const rest = [...createDeterministicDeck()].map(c => c.rank + c.suit).filter(c => !hole.includes(c));
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const prefix: string[] = [];
  for (let round = 0; round < 2; round++) for (const seat of view.postflopOrder) prefix.push(seat === heroSeat ? hole[round] : rest.shift()!);
  const deck = createDeterministicDeck([...prefix, ...rest]);
  const state = engine.startHand(waiting, deck);
  if (JSON.stringify(engine.heroCards(state, `p${heroSeat}`)) !== JSON.stringify(hole)) throw new Error("Incorrect conditioned holding");
  return { state, heroId: `p${heroSeat}`, deckHash: createHash("sha256").update(JSON.stringify(deck)).digest("hex") };
}

const contextCache = new Map<string, BotContext>();
export function context(state: PokerGameState, history: readonly PokerAIDecisionHistoryItem[], difficulty: AIDifficulty, samples: number): BotContext {
  const actor = engine.snapshot(state).currentActorId;
  if (!actor) throw new Error("Missing actor");
  const view = engine.decisionView(state);
  const seat = view.currentActorSeat;
  // Only memoize deterministic visible inputs; never use other holdings or future cards.
  const key = JSON.stringify([view, engine.heroCards(state, actor), history, difficulty, samples]);
  const cached = contextCache.get(key);
  if (cached) return cached;
  const ai = createPokerAIState(state, actor, { correctedContext: false, difficulty, equitySamples: samples,
    historyStatus: "complete", decisionHistory: legacyDecisionHistory(history.map(a => ({ ...a, actor: a.actorSeat === seat ? "hero" : "opponent" }))) });
  const result = { ...ai, sizingOptions: createLegacySizingOptions(ai) };
  if (contextCache.size >= 10000) contextCache.clear();
  contextCache.set(key, result);
  return result;
}
export function actionKey(action: PokerAction) { return `${action.type}:${"amount" in action ? action.amount ?? "" : ""}`; }
export function alternatives(state: PokerGameState, baseline: PokerAction) {
  const call = engine.getLegalActions(state).find(a => a.type === "call");
  if (call?.type !== "call") throw new Error("Opening call missing");
  const actions: { label: string; action: PokerAction }[] = [
    { label: "baseline", action: baseline }, { label: "fold", action: { type: "fold" } },
    { label: "call", action: { type: "call", amount: call.amount } }, { label: "raise3", action: { type: "raise", amount: 6 } },
  ];
  for (const { action } of actions) engine.applyAction(state, engine.snapshot(state).currentActorId!, action);
  return actions;
}

export function assertChips(state: PokerGameState) {
  const view = engine.decisionView(state);
  const stacks = view.players.reduce((sum, p) => sum + p.stack, 0);
  if (stacks + (view.street === "complete" ? 0 : view.pot) !== 200 * state.config.players.length) throw new Error("Chip conservation failed");
}
export async function rollout(initial: PokerGameState, heroId: string, first: PokerAction, group: Group,
  observe?: (state: PokerGameState, input: BotContext) => void, hero: PokerBot = new EquityRulesV2Bot()) {
  let state = initial;
  const startStack = engine.decisionView(state).players.find(p => p.id === heroId)!.stack;
  const history: PokerAIDecisionHistoryItem[] = [];
  const other = opponentBot(group.opponent);
  for (let sequence = 1; sequence <= 200; sequence++) {
    if (engine.snapshot(state).street === "complete") {
      assertChips(state);
      return { profitBB: (engine.decisionView(state).players.find(p => p.id === heroId)!.stack - startStack) / 2,
        actions: sequence - 1, completion: engine.snapshot(state).completionReason };
    }
    const actor = engine.snapshot(state).currentActorId!;
    let action: PokerAction;
    if (sequence === 1) { if (actor !== heroId) throw new Error("Wrong hero actor"); action = first; }
    else {
      const input = context(state, history, group.difficulty, actor === heroId || group.opponent === "frozen" ? group.samples : 1);
      observe?.(state, input);
      action = (await (actor === heroId ? hero : other).decide(input)).action;
    }
    const before = state;
    state = engine.applyAction(state, actor, action);
    assertChips(state);
    const projection = projectBotHistory({ version: 0, handNumber: 1, initialState: before,
      actions: [{ sequence: 1, action, stateBefore: before }] }, state, actor);
    if (projection.status !== "complete" || projection.actions.length !== 1) throw new Error("History projection failed");
    history.push({ ...projection.actions[0], sequence });
  }
  throw new Error("Action limit exceeded");
}
export interface Row { seed: number; deckHash: string; baseline: PokerAction; branch: string | null; values: Record<string, number>; uniqueActions: number; failure: string | null; }
export async function evaluate(group: Group, run: typeof rollout = rollout) {
  const rows: Row[] = [], hero = new EquityRulesV2Bot();
  for (let seed = 1; seed <= group.seeds; seed++) {
    const fixture = deal(group.hand, group.seats, seed);
    const decision = await hero.decide(context(fixture.state, [], group.difficulty, group.samples));
    const row: Row = { seed, deckHash: fixture.deckHash, baseline: decision.action, branch: decision.diagnostics.matchedRule ?? null, values: {}, uniqueActions: 0, failure: null };
    try {
      const cache = new Map<string, number>();
      for (const { label, action } of alternatives(fixture.state, decision.action)) {
        const key = actionKey(action);
        if (!cache.has(key)) cache.set(key, (await run(fixture.state, fixture.heroId, action, group)).profitBB);
        row.values[label] = cache.get(key)!;
      }
      row.uniqueActions = cache.size;
    } catch (error) { row.failure = error instanceof Error && error.message === "Action limit exceeded" ? "action_limit" : "rollout_failed"; row.values = {}; }
    rows.push(row);
  }
  return { group, rows };
}
export function summarize(result: Awaited<ReturnType<typeof evaluate>>) {
  const complete = result.rows.filter(r => !r.failure);
  const frequencies: Record<string, number> = {};
  for (const row of result.rows) { const key = actionKey(row.baseline); frequencies[key] = (frequencies[key] ?? 0) + 1; }
  return { group: result.group, complete: complete.length, excluded: result.rows.filter(r => r.failure).map(r => ({ seed: r.seed, failure: r.failure })), frequencies,
    comparisons: Object.fromEntries(["fold", "call", "raise3"].map(label => [label, {
      meanValueBB: complete.length ? complete.reduce((sum, r) => sum + r.values[label], 0) / complete.length : null,
      paired: bootstrapInterval(complete.map(r => r.values[label] - r.values.baseline)),
    }])) };
}
