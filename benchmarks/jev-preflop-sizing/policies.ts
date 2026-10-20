import type { BotContext } from "@/lib/bots/types";
import type { PokerAction } from "@/lib/poker/types";
import { riverShareBounds } from "@/lib/poker/adapter";
import type { Opponent } from "./config";
const ranks = "AKQJT98765432";
export const classes = ranks.split("").flatMap((high, i) => [high + high, ...ranks.slice(i + 1).split("").flatMap(low => [high + low + "s", high + low + "o"])]);
export function classify(cards: readonly string[]) {
  if (cards.length !== 2 || cards[0] === cards[1]) throw new Error("Invalid holding");
  const [a, b] = [...cards].sort((a, b) => ranks.indexOf(a[0]) - ranks.indexOf(b[0]));
  if (![a, b].every(c => /^[AKQJT2-9][cdhs]$/.test(c))) throw new Error("Invalid card");
  return a[0] + b[0] + (a[0] === b[0] ? "" : a[1] === b[1] ? "s" : "o");
}
export function responseClass(policy: Exclude<Opponent, "rules">, hand: string, shove: boolean): "raise" | "call" | "fold" {
  if (!classes.includes(hand)) throw new Error("Unknown class");
  const pair = hand.length === 2, suited = hand.endsWith("s"), a = hand[0], b = hand[1];
  const pairAtLeast = (rank: string) => pair && ranks.indexOf(a) <= ranks.indexOf(rank);
  const aceAtLeast = (rank: string) => a === "A" && !pair && ranks.indexOf(b) <= ranks.indexOf(rank);
  if (shove) return (policy === "selective" ? pairAtLeast("Q") || aceAtLeast("K") : pairAtLeast("8") || aceAtLeast("J") || hand === "KQs") ? "call" : "fold";
  if (policy === "selective") {
    if (pairAtLeast("Q") || aceAtLeast("K")) return "raise";
    return (pairAtLeast("7") || aceAtLeast("Q") || ["AJs", "KQs"].includes(hand)) ? "call" : "fold";
  }
  if (pairAtLeast("J") || aceAtLeast("Q")) return "raise";
  const connector = suited && (ranks.indexOf(b) - ranks.indexOf(a) === 1 || hand === "A2s");
  return pair || a === "A" || (a === "K" && suited) || ("AKQJT".includes(a) && "AKQJT".includes(b)) || connector ? "call" : "fold";
}
export const responseTables = Object.fromEntries((["selective", "loose"] as const).map(policy => [policy,
  Object.fromEntries(classes.map(hand => [hand, { small: responseClass(policy, hand, false), shove: responseClass(policy, hand, true) }]))]));
export function scripted(input: BotContext, policy: Exclude<Opponent, "rules">, root: number): PokerAction {
  const kind = responseClass(policy, classify(input.hero.holeCards), root === 200);
  if (kind === "raise") return { type: "raise", amount: 3 * root };
  if (kind === "fold") return { type: "fold" };
  const call = input.legalActions.find(a => a.type === "call");
  if (call?.type !== "call") throw new Error("Scripted call missing");
  return { type: "call", amount: call.amount };
}
export function conservative(input: BotContext): PokerAction {
  if (input.legalActions.some(a => a.type === "check")) return { type: "check" };
  const call = input.legalActions.find(a => a.type === "call");
  if (call?.type !== "call") return { type: "fold" };
  const pot = input.analysis.contestablePotAfterCall;
  if (!(pot > 0)) throw new Error("Invalid contestable pot");
  if (input.hand.street === "river") {
    const bounds = riverShareBounds(input.hero.holeCards, input.hand.communityCards);
    if (bounds.maximum === 0) return { type: "fold" };
    if (bounds.minimum > 0 && bounds.minimum * pot >= call.amount) return { type: "call", amount: call.amount };
  }
  return input.analysis.showdownEquity >= call.amount / pot + 0.05 ? { type: "call", amount: call.amount } : { type: "fold" };
}
