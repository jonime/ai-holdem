import { evaluateVisibleCards, riverShareBounds } from "@/lib/poker/adapter";
import { OpeningAwareEquityRulesBot } from "@/lib/bots/equity-rules-opening";
import type { BotContext, BotDecision } from "@/lib/bots/types";
import { createLegacySizingOptions } from "@/lib/typesafe/questions";

/** Exact tested public-line support; legacy production history has no contribution fields. */
export function supportedLine(c: BotContext) {
  const h = c.actionHistory, hero = c.hero.seat, other = c.opponents[0]?.seat;
  const shapes = [
    [[hero,"preflop","raise"],[other,"preflop","call"],[other,"flop","check"],[hero,"flop","bet"],[other,"flop","call"],[other,"turn","check"],[hero,"turn","check"],[other,"river","check"]],
    [[hero,"preflop","raise"],[other,"preflop","call"],[other,"flop","check"],[hero,"flop","check"],[other,"turn","check"],[hero,"turn","bet"],[other,"turn","call"],[other,"river","check"]],
  ];
  if (!shapes.some(shape => h.length === shape.length && shape.every(([seat,street,action],i) => h[i].sequence === i+1 && h[i].actorSeat === seat && h[i].street === street && h[i].action === action))) return false;
  const pre = h[0].amount, post = h.find(a => a.action === "bet")?.amount;
  if (c.game.bigBlind !== 2 || c.game.smallBlind !== 1 || pre == null || post == null || !Number.isInteger(pre) || !Number.isInteger(post) || pre < 4 || pre > 14 || post < 3 || post > 21) return false;
  const pot = 2 * (pre + post), stacks = [c.hero.stack, c.opponents[0]?.stack];
  return c.hand.pot === pot && c.analysis.livePot === pot && pot >= 14 && pot <= 70 &&
    [1,1.5,3].some(band => Math.min(...stacks) === pot * band) &&
    Math.abs(stacks[0]-stacks[1]) <= 12 && stacks.every(Number.isInteger);
}
export function override(c: BotContext, baseline: BotDecision): BotDecision {
  if (c.hand.street !== "river" || c.situation?.historyStatus !== "complete" || c.opponents.length !== 1 ||
      c.opponents[0].status !== "active" || c.situation.activeOpponentCount !== 1 ||
      c.situation.preflopOrder.length !== 2 || c.situation.postflopOrder.length !== 2 ||
      (c.situation.dealtPlayerCount !== undefined && c.situation.dealtPlayerCount !== 2) ||
      c.situation.postflopPosition !== "in_position" || c.situation.playersStillToAct.length !== 0 ||
      c.hero.amountToCall !== 0 || c.hero.investedThisStreet !== 0 || !supportedLine(c) ||
      baseline.action.type !== "bet" || baseline.diagnostics.matchedRule !== "rules-value-bet") return baseline;
  const board = c.hand.communityCards;
  if (board.length !== 5 || new Set(board.map(card => card[0])).size !== 5 ||
      [..."cdhs"].some(s => board.filter(card => card[1] === s).length >= 3) ||
      evaluateVisibleCards(c.hero.holeCards, board).category !== "straight") return baseline;
  const menu = createLegacySizingOptions(c);
  const half = menu.find(o => o.choice === "one_half_pot");
  const size = menu.find(o => o.choice === "two_thirds_pot");
  const legal = c.legalActions.find(a => a.type === "bet");
  if (half?.amount !== baseline.action.amount || !size || size.amount === null || !legal || legal.type !== "bet" ||
      size.amount <= baseline.action.amount || size.amount < legal.minAmount || size.amount > legal.maxAmount ||
      size.amount >= c.analysis.effectiveStack || c.analysis.effectiveStack !== Math.min(c.hero.stack,c.opponents[0].stack)) return baseline;
  const bounds = riverShareBounds(c.hero.holeCards, board);
  if (bounds.minimum < .5 || bounds.maximum <= .5) return baseline;
  return { ...baseline, action: { type: "bet", amount: size.amount }, diagnostics: { ...baseline.diagnostics, matchedRule: "rules-river-candidate-v1", sizing: { choice: size.choice, probabilities: null, confidence: null } } };
}
export class RiverCandidateBot extends OpeningAwareEquityRulesBot {
  override async decide(context: BotContext) { return override(context, await super.decide(context)); }
}
