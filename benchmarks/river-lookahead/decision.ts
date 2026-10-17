import { z } from "zod";
import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { createPokerAIState } from "@/lib/poker/ai-state";
import { legacyDecisionHistory, projectBotHistory, type BotHandContext } from "@/lib/poker/bot-history";
import { createLegacySizingOptions, createSizingOptions } from "@/lib/typesafe/questions";
import type { AIDifficulty, PokerAction } from "@/lib/poker/types";
import { deck } from "../range-equity/calculator";

const card = z.string().regex(/^[2-9TJQKA][cdhs]$/);
const action = z.discriminatedUnion("type", [z.object({ type: z.literal("check") }).strict(), z.object({ type: z.literal("call") }).strict(),
  z.object({ type: z.literal("bet"), amount: z.number().int().positive() }).strict(), z.object({ type: z.literal("raise"), amount: z.number().int().positive() }).strict()]);
export const decisionSchema = z.object({ version: z.literal("river-decision-v1"), dealtPlayers: z.literal(2), rake: z.literal(0), sidePots: z.literal(false),
  hero: z.tuple([card, card]), board: z.tuple([card, card, card, card, card]), stacks: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  smallBlind: z.number().int().positive(), bigBlind: z.number().int().positive(),
  history: z.array(z.object({ sequence: z.number().int().positive(), seat: z.union([z.literal(0), z.literal(1)]),
    street: z.enum(["preflop", "flop", "turn", "river"]), action }).strict()),
}).strict();
export type Decision = z.infer<typeof decisionSchema>;
export function key(a: PokerAction) { return `${a.type}${a.type === "bet" || a.type === "raise" ? `:${a.amount}` : ""}`; }
export function holdingKey(cards: readonly string[]) { return [...cards].sort().join(","); }

/** Only public transcript + hero cards enter this boundary. No actual opponent cards or deck accepted. */
export function replay(raw: Decision, opponent: readonly string[]) {
  const d = decisionSchema.parse(raw);
  const used = [...d.hero, ...d.board, ...opponent];
  if (opponent.length !== 2 || used.some(c => !deck.includes(c)) || new Set(used).size !== used.length) throw new Error("invalid-distinct-cards");
  const burns = deck.filter(c => !used.includes(c)).slice(0, 3);
  const waiting = engine.createGame({ smallBlind: d.smallBlind, bigBlind: d.bigBlind, seatCount: 2,
    players: d.stacks.map((stack, seat) => ({ id: `p${seat}`, name: `Seat ${seat}`, seat, stack, controller: "bot" })) });
  const initialState = engine.startHand(waiting, createDeterministicDeck([opponent[0], d.hero[0], opponent[1], d.hero[1],
    burns[0], ...d.board.slice(0, 3), burns[1], d.board[3], burns[2], d.board[4]]));
  if (holdingKey(engine.heroCards(initialState, "p0")) !== holdingKey(d.hero)) throw new Error("unexpected-deal-order");
  let state = initialState;
  const actions: BotHandContext["actions"][number][] = [];
  for (const [i, item] of d.history.entries()) {
    const view = engine.decisionView(state);
    if (item.sequence !== i + 1 || view.currentActorSeat !== item.seat || view.street !== item.street) throw new Error("incomplete-or-invalid-history");
    actions.push({ sequence: item.sequence, action: item.action, stateBefore: state });
    state = engine.applyAction(state, `p${item.seat}`, item.action);
  }
  const view = engine.decisionView(state);
  if (view.street !== "river" || JSON.stringify(view.communityCards) !== JSON.stringify(d.board) || view.currentActorSeat !== 0 || view.players.some(p => p.folded)) throw new Error("unsupported-river-node");
  if (view.players.length !== 2 || view.players[0].committedHand - view.players[0].committedStreet !== view.players[1].committedHand - view.players[1].committedStreet) throw new Error("side-pot-or-unequal-prior-contributions");
  const checked = view.currentBet === 0 && d.history.at(-1)?.seat === 1 && d.history.at(-1)?.street === "river" && d.history.at(-1)?.action.type === "check";
  const facing = view.players.find(p => p.seat === 1)?.allIn && engine.getLegalActions(state).some(a => a.type === "call");
  if (!checked && !facing) throw new Error("requires-last-to-act-check-or-facing-all-in");
  const history: BotHandContext = { version: 1, handNumber: 1, initialState, actions };
  const projected = projectBotHistory(history, state, "p0");
  if (projected.status !== "complete") throw new Error("incomplete-history");
  return { state, projected, kind: checked ? "checked-to" as const : "facing-all-in" as const };
}
export function contexts(run: ReturnType<typeof replay>, difficulty: AIDifficulty) {
  // Match bot-turn-service: default production budget, legacy history/context and sizing for Rules.
  const ai = createPokerAIState(run.state, "p0", { difficulty, correctedContext: false, historyStatus: "complete",
    decisionHistory: legacyDecisionHistory(run.projected.actions) });
  return { baseline: { ...ai, sizingOptions: createLegacySizingOptions(ai) }, menu: createSizingOptions(ai) };
}
export function candidates(run: ReturnType<typeof replay>, baseline: PokerAction, difficulty: AIDifficulty) {
  const actions: PokerAction[] = run.kind === "checked-to" ? [{ type: "check" }] : [{ type: "fold" }, { type: "call" }];
  if (run.kind === "checked-to") for (const size of contexts(run, difficulty).menu) {
    if (size.amount !== null) actions.push({ type: "bet", amount: size.amount });
  }
  actions.push(baseline);
  const unique = [...new Map(actions.map(a => [key(a), a])).values()];
  for (const a of unique) engine.applyAction(run.state, "p0", a);
  return unique;
}
