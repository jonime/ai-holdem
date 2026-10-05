import "server-only";
import type { PokerAIState } from "./ai-state";

export const pokerAdviceVersion = "poker-advice-v1";
export interface PokerStrategyAdvice {
  readonly version: string;
  readonly scope: "heads_up" | "multiway" | "general";
  readonly items: readonly { readonly id: string; readonly text: string }[];
}
/** Original qualitative advice, inspired by selective retrieval in PokerSkill.
 * No imported tables, numerical defense budgets, ranges, or action restrictions.
 */
export function selectPokerAdvice(context: PokerAIState): PokerStrategyAdvice {
  const items: { id:string; text:string }[] = [];
  const add = (id:string,text:string) => items.push({ id,text });
  const facts = context.facts;
  const situation = context.situation;
  const supported = ["preflop","flop","turn","river"].includes(context.hand.street) && context.opponents.some(p => p.status !== "folded");
  const known = facts?.historyStatus === "complete" && situation?.historyStatus === "complete";
  const streetEvents = context.actionHistory.filter(e => e.street === context.hand.street);
  const headsUp = supported && known && situation.activeOpponentCount === 1 &&
    (context.hand.street === "preflop" ? situation.preflopOrder.length === 2 :
      streetEvents.every(e => e.activeSeats !== undefined && e.activeSeats.length === 2));
  const patternHeadsUp = headsUp && context.actionHistory.filter(event => event.street !== "preflop")
    .every(event => event.activeSeats !== undefined && event.activeSeats.length === 2);
  const scope = !supported || !known ? "general" : headsUp ? "heads_up" : "multiway";
  add("advisory", "These recommendations are advisory. Keep every supplied candidate available; exact river safeguards and legal bounds take priority. Playstyle is a preference, and observed pressure is not equity.");
  if (scope === "general" || !facts || !situation) {
    add("unknown", "Some situation or history assumptions are unknown. Use observed cards, exact costs and legal sizes; avoid guessed action lines or positional range certainty.");
    return { version:pokerAdviceVersion,scope,items };
  }
  if (scope === "multiway") add("multiway", "Account for multiple continuing ranges, including all-in opponents. Bluffs must get through everyone who can continue; assume less fold equity and require clearer value or draw justification. Do not apply heads-up defense frequencies.");
  if (context.hand.street === "preflop") {
    const late = context.hero.position === "button" || context.hero.position === "cutoff";
    if (situation.preflop === "unopened") add(late ? "open-late" : "open-early",
      late ? "In an unopened pot, later position and fewer players behind make more hands plausible opens. Prefer hands that realize equity well; use the supplied big-blind opening sizes rather than a pot-size guess."
        : "In an unopened pot, players behind and future position matter. Early seats need more robust holdings; small-blind opens also face a postflop position disadvantage. Avoid treating every non-button seat as the big blind.");
    else if (situation.preflop === "limped") add("limped", "Limped pots differ from unopened pots. Isolate for value or with hands that play well against callers; increase concern about multiple callers and avoid assuming limps are folds.");
    else add(situation.preflop === "re-raised" ? "reraised" : "defend", "Facing a raise, weigh price, raiser position, players behind and equity realization. Re-raises strengthen the observed line without proving a range. Dominated offsuit holdings realize poorly; avoid speculative calls at shallow effective stacks.");
    if (facts.startingHand.pair) add("pair", "A pocket pair has immediate showdown value. Small pairs depend on the price and realistic future value, especially when stacks are shallow or several opponents may continue.");
    else if (facts.startingHand.suited || facts.startingHand.connected) add("playability", "Suitedness and connectivity improve possible future holdings, but do not by themselves justify a call or re-raise at any price.");
    if (headsUp) add("hu-preflop", "The heads-up button posts the small blind, acts first preflop and last postflop. Both ranges can be wider than six-seat early-position ranges; the big blind still weighs price and postflop disadvantage.");
  } else {
    add("intent", "Before betting or raising, identify value from worse continuing hands or a credible bluff target. A made category alone is insufficient: compare kickers and whether HERO improves on the board.");
    if (facts.madeHand.boardOnly) add("board-only", "HERO plays the board's best hand. Shared board strength is not private value; consider ties and opponents who can improve on it.");
    if (context.hero.amountToCall === 0) add("pot-control", "Checking can preserve showdown value and protect the checking range. Bet when worse hands can pay or plausible better hands can fold, considering the next street and remaining stack.");
    if (context.hand.street !== "river" && (facts.draws.flushDrawSuits.length || facts.draws.straightCompletionRanks.length)) add("draw", "For a real draw, compare exact call cost and contestable pot with realistic clean outs, reverse implied odds and future costs. Semi-bluff only when fold equity is plausible; board-shared draws do not give HERO exclusive equity.");
    else if (context.hand.street === "flop" && (facts.draws.backdoorFlushSuits.length || facts.draws.backdoorStraight)) add("backdoor", "A backdoor draw needs two favorable future cards. It supports some selective bluffs or cheap continuations, but is weaker than a one-card completion draw.");
    if (situation.postflopPosition === "in_position") add("position-last", "Acting last gives information and control over pot growth. Use that information without assuming a check always means weakness.");
    else add("position-first", "Acting before one or more opponents reduces control of future prices. Favor robust value and clean draws; plan for bets or raises behind you.");
    const pressureEvents = facts.pressure.flatMap(p => p.streets.flatMap(s => s.events));
    if (pressureEvents.length > 1) add("pressure", "The individual pressure events show repeated investment. Reassess bluff-catching and draw continuation against the observed sizes and changing board; a sum of pot fractions is neither a probability nor a numerical defense allowance.");
    if (patternHeadsUp) {
      const labels = facts.actionLines.filter(line => line.street === context.hand.street).flatMap(line => line.labels);
      if (labels.includes("check_raise")) add("hu-check-raise", "A heads-up check-raise applies pressure after an initial check. Continue with hands that withstand the range and price; distinguish credible value from draws rather than automatically folding or re-raising.");
      if (labels.includes("continuation_bet") || labels.includes("repeated_barrel")) add("hu-barrel", "A heads-up aggressor may continue with value and bluffs. Board changes, sizing and available blockers help assess the line; repeated barrels do not establish a specific holding.");
      if (labels.includes("probe") || labels.includes("previous_aggressor_checking") || labels.includes("delayed_continuation_bet")) add("hu-checked-line", "A checked or delayed heads-up line can contain both pot-control value and weakness. Choose value targets or plausible folds using the full history; do not equate a missed continuation bet with surrender.");
      if (labels.includes("donk_bet")) add("hu-lead", "A lead into the previous aggressor may reflect board interaction, value, or a bluff. Judge its actual size and board change rather than assuming the lead is weak.");
    }
    if (context.hand.street === "river") add("river-blockers", "No future draws remain. For a bluff, prefer visible card removal that reduces plausible strong calls without removing the hands you want to fold. For a bluff-catch, consider which bluffs HERO blocks as well as value. These are range hypotheses, not known opponent cards.");
  }
  if (context.analysis.stackToPotRatio <= 2) add("low-spr", "At low effective stack-to-pot ratio, further bets can commit much of the remaining stack. Plan the whole commitment and contestable pots; speculative future value is limited, while a low ratio alone does not make every pair a stack-off.");
  return { version:pokerAdviceVersion,scope,items };
}
