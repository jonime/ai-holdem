import { EquityRulesV2Bot } from "@/lib/bots/equity-rules-v2";
import type { BotContext, BotDecision, PokerBot } from "@/lib/bots/types";
export const targets = ["medium-kk", "hard-qq"] as const;
export type Target = typeof targets[number];
export type Choice = "call" | "raise3";
export type Selection = Partial<Record<Target, Choice>>;
export function targetFor(context: BotContext): Target | null {
  const ranks = context.hero.holeCards.map(c => c[0]).join("");
  return context.difficulty === "medium" && ranks === "KK" ? "medium-kk"
    : context.difficulty === "hard" && ranks === "QQ" ? "hard-qq" : null;
}
export function eligible(context: BotContext, baseline: BotDecision) {
  const bb = context.game.bigBlind;
  return baseline.action.type === "fold" && targetFor(context) !== null && bb > 0 &&
    context.hand.street === "preflop" && context.hand.communityCards.length === 0 &&
    context.situation?.historyStatus === "complete" && context.situation.preflop === "unopened" &&
    context.actionHistory.length === 0 && context.hero.position === "UTG" &&
    context.hero.investedThisStreet === 0 && context.hero.stack === 100 * bb &&
    context.opponents.length === 5 && context.situation.activeOpponentCount === 5 &&
    context.opponents.every(o => o.status === "active" && o.stack + (o.position === "small_blind" ? context.game.smallBlind : o.position === "big_blind" ? bb : 0) === 100 * bb);
}
/** Benchmark-only, visible-input override. Baseline calls/raises and every continuation stay intact. */
export function override(context: BotContext, baseline: BotDecision, selection: Selection): BotDecision {
  const target = targetFor(context), choice = target ? selection[target] : undefined;
  if (!choice || !eligible(context, baseline)) return baseline;
  const legal = context.legalActions.find(a => a.type === (choice === "call" ? "call" : "raise"));
  if (!legal) throw new Error("Candidate legal action missing");
  const action = choice === "call" && legal.type === "call" ? { type: "call" as const, amount: legal.amount }
    : legal.type === "raise" ? { type: "raise" as const, amount: 3 * context.game.bigBlind } : null;
  if (!action || (action.type === "raise" && legal.type === "raise" && (action.amount < legal.minAmount || action.amount > legal.maxAmount))) throw new Error("Candidate action out of bounds");
  return { ...baseline, action, diagnostics: { ...baseline.diagnostics, matchedRule: `candidate:${target}:${choice}` } };
}
export class CandidateBot implements PokerBot {
  private readonly baseline = new EquityRulesV2Bot();
  constructor(readonly selection: Selection) {}
  async decide(context: BotContext) { return override(context, await this.baseline.decide(context), this.selection); }
}
