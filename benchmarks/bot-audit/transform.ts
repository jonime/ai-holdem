import type { PokerAction } from "@/lib/poker/types";
import type { BotSessionStats } from "@/lib/poker/session-stats";
import type { ReplaySpec } from "./replay-adapter";
export const representations = ["original", "suits", "hole-order", "seats", "chips"] as const;
export type Representation = typeof representations[number];
export interface Mapping { suits: string; rotation: number; seats: number; scale: number; reverse: boolean }
export function mapping(spec: ReplaySpec, representation: Representation): Mapping {
  return { suits: representation === "suits" ? "dhsc" : "cdhs", rotation: representation === "seats" ? 1 : 0,
    seats: spec.config.seatCount ?? spec.config.players.length, scale: representation === "chips" ? 10 : 1, reverse: representation === "hole-order" };
}
export function seatMap(seat: number, m: Mapping, inverse = false) { return (seat + (inverse ? -m.rotation : m.rotation) + m.seats) % m.seats; }
export function cardMap(card: string, m: Mapping, inverse = false) {
  if (!/^[2-9TJQKA][cdhs]$/.test(card) || new Set(m.suits).size !== 4 || [...m.suits].some(s => !"cdhs".includes(s))) throw new Error("Invalid card or suit permutation");
  const from = inverse ? m.suits : "cdhs", to = inverse ? "cdhs" : m.suits;
  return card[0] + to[from.indexOf(card[1])];
}
export function amountMap(amount: number, m: Mapping, inverse = false) {
  if (![1, 10].includes(m.scale)) throw new Error("Unsupported scaling");
  const value = inverse ? amount / m.scale : amount * m.scale;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Unsupported non-integral chip amount");
  return value;
}
export function actionMap(action: PokerAction, m: Mapping, inverse = false): PokerAction {
  if (action.type === "bet" || action.type === "raise") return { type: action.type, amount: amountMap(action.amount, m, inverse) };
  if (action.type === "call" && action.amount !== undefined) return { type: "call", amount: amountMap(action.amount, m, inverse) };
  return { ...action };
}
export function transform(spec: ReplaySpec, hero: number, m: Mapping, inverse = false): ReplaySpec {
  if (m.seats !== (spec.config.seatCount ?? spec.config.players.length) || !Number.isInteger(m.rotation)) throw new Error("Unsupported seat mapping");
  let deck = spec.deck.map(c => cardMap(c, m, inverse));
  if (m.reverse) {
    const n = m.seats, order = Array.from({ length: n }, (_, i) => (spec.button + 1 + i) % n), index = order.indexOf(hero);
    deck = [...deck]; [deck[index], deck[index + n]] = [deck[index + n], deck[index]];
  }
  return { ...spec, button: seatMap(spec.button, m, inverse), deck,
    config: { ...spec.config, smallBlind: amountMap(spec.config.smallBlind, m, inverse), bigBlind: amountMap(spec.config.bigBlind, m, inverse),
      ...(spec.config.startingStack === undefined ? {} : { startingStack: amountMap(spec.config.startingStack, m, inverse) }),
      players: spec.config.players.map(p => ({ ...p, seat: seatMap(p.seat, m, inverse), stack: amountMap(p.stack, m, inverse) })) },
    line: spec.line.map(step => ({ seat: seatMap(step.seat, m, inverse), action: actionMap(step.action, m, inverse) })) };
}
export function remapStats(stats: BotSessionStats | undefined, m: Mapping, inverse = false): BotSessionStats | undefined {
  return stats && { ...stats, participants: stats.participants.map(p => ({ ...p, seat: seatMap(p.seat, m, inverse) })) };
}
