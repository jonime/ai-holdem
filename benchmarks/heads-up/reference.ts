/** Evaluation-owned format. No reference is approved merely by parsing it. */
import { z } from "zod";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import type { PokerAction, PokerGameState } from "@/lib/poker/types";
import { projectBotHistory, type BotHandContext } from "@/lib/poker/bot-history";
import type { BotContext } from "@/lib/bots/types";
import { createMoveOptions } from "@/lib/typesafe/questions";
import { handClasses } from "../poker-context-harness";

const amount = z.number().finite().nonnegative();
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fold") }).strict(), z.object({ type: z.literal("check") }).strict(),
  z.object({ type: z.literal("call"), amountBB: amount }).strict(),
  z.object({ type: z.literal("raise"), amountBB: amount.positive() }).strict(),
  z.object({ type: z.literal("bet"), amountBB: amount.positive() }).strict(),
]);
export const situationSchema = z.object({
  dealtPlayers: z.literal(2), street: z.literal("preflop"), position: z.enum(["button", "big_blind"]),
  startingStacksBB: z.tuple([amount.positive(), amount.positive()]), effectiveStackBB: amount.positive(),
  smallBlindBB: z.literal(0.5), rake: z.literal(0), anteBB: z.literal(0),
  commitmentsBB: z.tuple([amount, amount]),
  line: z.array(z.object({ position: z.enum(["button", "big_blind"]), action: actionSchema }).strict()),
}).strict();
const entrySchema = z.object({
  actions: z.array(z.object({ action: actionSchema, frequency: z.number().finite().min(0).max(1), evBB: z.number().finite().optional() }).strict()).min(1),
}).strict().superRefine((entry, ctx) => {
  if (Math.abs(entry.actions.reduce((sum, a) => sum + a.frequency, 0) - 1) > 1e-9) ctx.addIssue({ code: "custom", message: "Frequencies must sum to one; no renormalization" });
  if (new Set(entry.actions.map(a => JSON.stringify(a.action))).size !== entry.actions.length) ctx.addIssue({ code: "custom", message: "Duplicate actions" });
  if (entry.actions.some(a => a.evBB !== undefined) && entry.actions.some(a => a.evBB === undefined)) ctx.addIssue({ code: "custom", message: "EVs require the complete menu" });
});
export const referenceSchema = z.object({
  version: z.literal("hu-reference-v1"), dataVersion: z.string().min(1),
  source: z.object({ url: z.url(), revision: z.string().min(1), attribution: z.string().min(1),
    codeLicense: z.string().min(1), dataTerms: z.string().min(1), redistribution: z.literal("permitted"),
    generation: z.string().min(1), stackConvention: z.literal("before_blinds"),
    actionConvention: z.literal("raise_bet_to_call_additional_bb"), actionTree: z.string().min(1),
    postflopModel: z.string().min(1), convergence: z.string().min(1), limitations: z.array(z.string().min(1)).min(1),
    independentChecks: z.array(z.string().min(1)).min(1),
  }).strict(),
  nodes: z.array(z.object({ id: z.string().min(1), split: z.enum(["development", "held-out"]), situation: situationSchema,
    opponentRange: z.string().min(1), assumptions: z.string().min(1),
    ev: z.object({ units: z.literal("BB_per_decision"), baseline: z.string().min(1), assumptions: z.string().min(1) }).strict().optional(),
    hands: z.record(z.string(), entrySchema),
  }).strict()).min(1),
}).strict().superRefine((data, ctx) => {
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const node of data.nodes) {
    const key = JSON.stringify(node.situation);
    if (keys.has(key) || ids.has(node.id)) ctx.addIssue({ code: "custom", message: "Duplicate situation or node id" });
    keys.add(key); ids.add(node.id);
    if (node.situation.effectiveStackBB !== Math.min(...node.situation.startingStacksBB)) ctx.addIssue({ code: "custom", message: "Incorrect effective stack" });
    if (Object.keys(node.hands).length !== 169 || handClasses.some(h => !node.hands[h.notation])) ctx.addIssue({ code: "custom", message: "Require all 169 canonical classes" });
    for (const entry of Object.values(node.hands)) {
      if (entry.actions.some(a => a.evBB !== undefined) !== !!node.ev) ctx.addIssue({ code: "custom", message: "EV metadata mismatch" });
    }
  }
});
export type Reference = z.infer<typeof referenceSchema>;
export type ReferenceNode = Reference["nodes"][number];
export type Entry = ReferenceNode["hands"][string];
export function importReference(input: unknown): Reference { return referenceSchema.parse(input); }
export const actionKey = (action: PokerAction) => `${action.type}:${"amount" in action ? action.amount ?? "missing" : ""}`;
export function engineAction(action: z.infer<typeof actionSchema>, bb: number): PokerAction {
  if (action.type === "fold" || action.type === "check") return { type: action.type };
  return { type: action.type, amount: action.amountBB * bb };
}
export function handClass(cards: readonly string[]) {
  if (cards.length !== 2 || cards.some(c => !/^[AKQJT2-9][shdc]$/.test(c)) || cards[0] === cards[1]) throw new Error("Invalid hero holding");
  const ranks = "AKQJT98765432";
  const [a, b] = [...cards].sort((x, y) => ranks.indexOf(x[0]) - ranks.indexOf(y[0]));
  return a[0] === b[0] ? a[0] + b[0] : a[0] + b[0] + (a[1] === b[1] ? "s" : "o");
}
/** Uses public commitments and complete replay history, never opponent holdings/deck. */
export function exactSituation(state: PokerGameState, history: BotHandContext) {
  if (!history.initialState || history.actions.some(a => !a.action || !a.stateBefore)) return null;
  const initial = engine.decisionView(history.initialState), view = engine.decisionView(state);
  const actor = view.players.find(p => p.seat === view.currentActorSeat);
  if (projectBotHistory(history, state, engine.snapshot(state).currentActorId!).status !== "complete") return null;
  if (initial.players.length !== 2 || view.street !== "preflop" || !actor || !["button", "big_blind"].includes(actor.position)) return null;
  const ordered = (v: typeof view) => [v.players.find(p => p.seat === initial.buttonSeat)!, v.players.find(p => p.seat === initial.bigBlindSeat)!];
  const starts = ordered(initial).map(p => (p.stack + p.committedHand) / view.bigBlind);
  const line = history.actions.map(item => {
    const v = engine.decisionView(item.stateBefore!);
    const p = v.players.find(p => p.seat === v.currentActorSeat)!;
    const a = item.action!;
    const legal = engine.getLegalActions(item.stateBefore!).find(l => l.type === a.type);
    const payment = a.type === "call" && legal?.type === "call" ? legal.amount : "amount" in a ? a.amount : undefined;
    return { position: p.position, action: payment === undefined ? { type: a.type } : { type: a.type, amountBB: payment / view.bigBlind } };
  });
  const parsed = situationSchema.safeParse({ dealtPlayers: 2, street: "preflop", position: actor.position,
    startingStacksBB: starts, effectiveStackBB: Math.min(...starts), smallBlindBB: view.smallBlind / view.bigBlind,
    rake: 0, anteBB: 0, commitmentsBB: ordered(view).map(p => p.committedStreet / view.bigBlind), line });
  return parsed.success ? parsed.data : null;
}
export type Match = { supported: true; node: ReferenceNode; entry: Entry } | { supported: false; reason: string };
export function matchReference(data: Reference, state: PokerGameState, history: BotHandContext, context: BotContext): Match {
  const situation = exactSituation(state, history);
  if (!situation) return { supported: false, reason: "not_complete_dealt_heads_up_preflop" };
  const node = data.nodes.find(n => JSON.stringify(n.situation) === JSON.stringify(situation));
  if (!node) return { supported: false, reason: "exact_configuration_missing" };
  const entry = node.hands[handClass(context.hero.holeCards)];
  const candidates = new Set(createMoveOptions(context).map(m => actionKey(m.action)));
  for (const option of entry.actions.filter(a => a.frequency > 0)) {
    const action = engineAction(option.action, context.game.bigBlind);
    if (!candidates.has(actionKey(action))) return { supported: false, reason: "positive_action_outside_candidate_menu" };
    try { engine.applyAction(state, engine.snapshot(state).currentActorId!, action); }
    catch { return { supported: false, reason: "positive_action_engine_incompatible" }; }
  }
  return { supported: true, node, entry };
}
export function sampleEntry(entry: Entry, bb: number, random: () => number): PokerAction {
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error("Random draw outside [0,1)");
  let cumulative = 0;
  for (const option of entry.actions) { cumulative += option.frequency; if (draw < cumulative && option.frequency > 0) return engineAction(option.action, bb); }
  throw new Error("Uncovered probability mass");
}
export function scoreReference(match: Match, context: BotContext, selected: PokerAction, opponentRange: string) {
  if (!match.supported || opponentRange !== match.node.opponentRange) return null;
  const menu = createMoveOptions(context).map(m => actionKey(m.action)).sort();
  const referenceMenu = match.entry.actions.map(a => actionKey(engineAction(a.action, context.game.bigBlind))).sort();
  if (JSON.stringify(menu) !== JSON.stringify(referenceMenu)) return null;
  const option = match.entry.actions.find(a => actionKey(engineAction(a.action, context.game.bigBlind)) === actionKey(selected));
  if (!option) return null;
  return { supportedAction: option.frequency > 0, referenceFrequency: option.frequency,
    regretBB: option.evBB === undefined ? null : Math.max(...match.entry.actions.map(a => a.evBB!)) - option.evBB,
    interpretation: option.evBB === undefined ? "descriptive_not_strength" : "reference_conditional_EV" };
}
export function frequencyDeviation(entry: Entry, actions: readonly PokerAction[], bb: number) {
  if (!actions.length) return null;
  const expected = new Map(entry.actions.map(a => [actionKey(engineAction(a.action, bb)), a.frequency]));
  const observed = new Map<string, number>();
  for (const action of actions) observed.set(actionKey(action), (observed.get(actionKey(action)) ?? 0) + 1 / actions.length);
  return [...new Set([...expected.keys(), ...observed.keys()])].reduce((sum, key) => sum + Math.abs((expected.get(key) ?? 0) - (observed.get(key) ?? 0)), 0) / 2;
}
export function seededRandom(seed: number) { let value = seed >>> 0; return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 2 ** 32; }; }
