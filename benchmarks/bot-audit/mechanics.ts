import { isDeepStrictEqual } from "node:util";
import type { BotContext } from "@/lib/bots/types";
import { prepareProviderContext } from "@/lib/poker/provider-context";
import { selectJevOpponentAdvice } from "@/lib/poker/opponent-advice";
import { selectPokerAdvice } from "@/lib/poker/strategy-advice";
import { createMoveOptions } from "@/lib/typesafe/questions";
import { cardMap, seatMap, type Mapping } from "./transform";
const money = new Set(["amount", "minAmount", "maxAmount", "smallBlind", "bigBlind", "stack", "pot", "livePot", "callCost", "contestablePotAfterCall", "effectiveStack", "investedThisStreet", "amountToCall", "payment", "commitment", "potBefore", "potAfter", "raiseIncrement"]);
const seats = new Set(["seat", "actorSeat"]);
const seatLists = new Set(["activeSeats", "playersStillToAct", "preflopOrder", "postflopOrder"]);
const unordered = new Set(["opponents", "participants", "effectiveStacks", "pressure", "opponent"]);
/** Inverse semantic projection, never used as a provider input. */
export function normalize(value: unknown, m: Mapping, bb: number, key = ""): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return seats.has(key) || seatLists.has(key) ? seatMap(value, m, true) : money.has(key) ? value / bb : value;
  if (typeof value === "string") {
    if (/^[2-9TJQKA][cdhs]$/.test(value)) return cardMap(value, m, true);
    if (value.length === 1 && "cdhs".includes(value)) return "cdhs"[m.suits.indexOf(value)];
    return value.replace(/seat (\d+)/g, (_, seat) => `seat ${seatMap(Number(seat), m, true)}`);
  }
  if (Array.isArray(value)) {
    const items = value.map(v => normalize(v, m, bb, key));
    if (unordered.has(key)) return items.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    // Best-five physical representatives can vary on tied ranks; compare rank/kicker
    // facts separately and retain raw fact hashes for this representational detail.
    if (["bestFive", "holeCardsInBestFive", "boardCardsInBestFive"].includes(key)) return items.map(v => String(v)[0]).sort();
    if (["holeCards", "flushDrawSuits", "backdoorFlushSuits", "activeSeats"].includes(key)) return items.sort();
    return items;
  }
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => {
    const mappedKey = k.length === 1 && "cdhs".includes(k) ? "cdhs"[m.suits.indexOf(k)] : k;
    return [mappedKey, normalize(v, m, bb, k)];
  }).sort(([a],[b]) => String(a).localeCompare(String(b))));
  throw new Error("Unsupported context value");
}
export function mechanicalView(context: BotContext, m: Mapping) {
  const c = prepareProviderContext(context), bb = c.game.bigBlind;
  return normalize({
    legal: c.legalActions,
    prices: { game: c.game, hero: { ...c.hero, handStrength: undefined }, hand: c.hand, analysis: c.analysis },
    situation: c.situation, history: c.actionHistory, opponents: c.opponents,
    facts: c.facts, statistics: c.sessionStats,
    advice: { strategy: selectPokerAdvice(c), opponent: selectJevOpponentAdvice(c) },
    menu: createMoveOptions(c).map(o => ({ type: o.action.type, amount: "amount" in o.action ? o.action.amount : null, sizing: o.sizingChoice })),
  }, m, bb);
}
export function differences(a: unknown, b: unknown): string[] {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return isDeepStrictEqual(a,b) ? [] : ["root"];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => !isDeepStrictEqual(Reflect.get(a,key), Reflect.get(b,key)));
}
export function normalizedDecision(action: import("@/lib/poker/types").PokerAction, context: BotContext) {
  const amount = "amount" in action ? action.amount ?? 0 : null;
  return { type: action.type, amountBB: amount === null ? null : amount / context.game.bigBlind };
}
