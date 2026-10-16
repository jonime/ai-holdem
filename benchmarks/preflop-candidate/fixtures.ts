import { createHash } from "node:crypto";
import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import type { PokerAction, PokerGameState } from "@/lib/poker/types";
import type { PokerAIDecisionHistoryItem } from "@/lib/poker/ai-state";
import { projectBotHistory } from "@/lib/poker/bot-history";
import { randomSource } from "../equity-rules/experiment";
import type { Target } from "./candidate";
export const version = "preflop-candidate-v1";
export const handNumbers = [1, 2, 7, 16] as const;
export const suits = ["c", "d", "h", "s"];
export const combinations = suits.flatMap((s, i) => suits.slice(i + 1).map(t => [s, t] as const));
export type Phase = "screen" | "confirm";
export interface Spec { id: string; phase: Phase; target: Target; combo: number; handNumber: number; replicate: number; }
export function allocation(phase: Phase): Spec[] {
  return (["medium-kk", "hard-qq"] as const).flatMap(target => combinations.flatMap((_, combo) => handNumbers.flatMap(handNumber =>
    Array.from({ length: phase === "screen" ? 4 : 10 }, (_, i) => ({ id: `${phase}-${target}-${combo}-${handNumber}-${i + 1}`, phase, target, combo, handNumber, replicate: i + 1 })))));
}
const baseCache = new Map<string, PokerGameState>();
export function base(seats = 6, stackBB = 100, handNumber = 1) {
  const key = `${seats}:${stackBB}:${handNumber}`, cached = baseCache.get(key);
  if (cached) return cached;
  let state = engine.createGame({ smallBlind: 1, bigBlind: 2, seatCount: seats,
    players: Array.from({ length: seats }, (_, seat) => ({ id: `p${seat}`, name: `Seat ${seat}`, seat, controller: "bot" as const, stack: 2 * stackBB })) });
  const board = ["As", "Ks", "Qs", "Js", "Ts"];
  const rest = createDeterministicDeck().map(c => c.rank + c.suit).filter(c => !board.includes(c));
  const holes = rest.slice(0, seats * 2), burns = rest.slice(seats * 2, seats * 2 + 3);
  const neutralDeck = createDeterministicDeck([...holes, burns[0], ...board.slice(0, 3), burns[1], board[3], burns[2], board[4]]);
  for (let n = 1; n < handNumber; n++) {
    state = engine.startHand(state, neutralDeck);
    for (let step = 0; engine.snapshot(state).street !== "complete"; step++) {
      if (step >= 100) throw new Error("Neutral setup did not finish");
      const legal = engine.getLegalActions(state), action = legal.find(a => a.type === "check") ?? legal.find(a => a.type === "call");
      if (!action || (action.type !== "call" && action.type !== "check")) throw new Error("Neutral setup action missing");
      state = engine.applyAction(state, engine.snapshot(state).currentActorId!, action);
    }
    if (engine.decisionView(state).players.some(p => p.stack !== 2 * stackBB)) throw new Error("Neutral setup changed stacks");
  }
  baseCache.set(key, state);
  return state;
}
export interface Fixture { state: PokerGameState; heroId: string; history: PokerAIDecisionHistoryItem[]; deckHash: string; }
export function opening(cards: readonly string[], namespace: string, options: { seats?: number; stackBB?: number; handNumber?: number; position?: string; unequal?: boolean } = {}): Fixture {
  const seats = options.seats ?? 6, stackBB = options.stackBB ?? 100;
  let waiting = base(seats, stackBB, options.handNumber ?? 1);
  if (options.unequal) waiting = engine.createGame({ ...waiting.config, players: waiting.config.players.map((p, i) => ({ ...p, stack: i === 0 ? 2 * stackBB - 2 : 2 * stackBB })) });
  const view = engine.decisionView(engine.startHand(waiting, createDeterministicDeck()));
  const heroSeat = options.position ? view.players.find(p => p.position === options.position)!.seat : view.currentActorSeat!;
  const random = randomSource(createHash("sha256").update(`${version}:${namespace}`).digest().readUInt32LE());
  const rest = createDeterministicDeck().map(c => c.rank + c.suit).filter(c => !cards.includes(c));
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const prefix: string[] = [];
  for (let round = 0; round < 2; round++) for (const seat of view.postflopOrder) prefix.push(seat === heroSeat ? cards[round] : rest.shift()!);
  const deck = createDeterministicDeck([...prefix, ...rest]);
  let state = engine.startHand(waiting, deck);
  const history: PokerAIDecisionHistoryItem[] = [];
  const bigBlind = view.bigBlindSeat === heroSeat;
  while (engine.decisionView(state).currentActorSeat !== heroSeat) {
    const legalCall = engine.getLegalActions(state).find(a => a.type === "call");
    const action: PokerAction = bigBlind && history.length === 0 && legalCall?.type === "call" ? { type: "call", amount: legalCall.amount } : { type: "fold" };
    const before = state, actor = engine.snapshot(state).currentActorId!;
    state = engine.applyAction(state, actor, action);
    history.push(projectStep(before, state, action, history.length + 1));
  }
  if (JSON.stringify(engine.heroCards(state, `p${heroSeat}`)) !== JSON.stringify(cards)) throw new Error("Holding mismatch");
  return { state, heroId: `p${heroSeat}`, history, deckHash: createHash("sha256").update(JSON.stringify(deck)).digest("hex") };
}
export function projectStep(before: PokerGameState, after: PokerGameState, action: PokerAction, sequence: number) {
  const p = projectBotHistory({ version: 0, handNumber: engine.snapshot(before).handNumber, initialState: before,
    actions: [{ sequence: 1, action, stateBefore: before }] }, after, engine.snapshot(before).currentActorId!);
  if (p.status !== "complete" || p.actions.length !== 1) throw new Error("Projection failed");
  return { ...p.actions[0], sequence };
}
export function materialize(spec: Spec) {
  const rank = spec.target === "medium-kk" ? "K" : "Q";
  return opening(combinations[spec.combo].map(s => rank + s), spec.id, { handNumber: spec.handNumber });
}
