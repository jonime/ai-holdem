import type { PokerAIState } from "./ai-state";
import { riverShareBounds } from "./adapter";
import type { LegalAction } from "./types";

/** Strategic candidates are a subset of engine legality, using visible cards only. */
export function decisionCandidates(state: PokerAIState): readonly LegalAction[] {
  const canCheck = state.legalActions.some((action) => action.type === "check");
  const candidates = state.legalActions.filter(
    (action) => !(canCheck && action.type === "fold"),
  );
  if (
    state.hand.street !== "river" ||
    state.opponents.filter((opponent) => opponent.status !== "folded").length !== 1
  ) return candidates;

  const bounds = riverShareBounds(state.hero.holeCards, state.hand.communityCards);
  const call = candidates.find((action) => action.type === "call");
  const guaranteedCall = call?.type === "call" &&
    state.analysis.contestablePotAfterCall > 0 && bounds.minimum > 0 &&
    bounds.minimum * state.analysis.contestablePotAfterCall >= call.amount;
  const forcedSplit = bounds.minimum === 0.5 && bounds.maximum === 0.5;
  return candidates.filter((action) => {
    if (action.type === "fold" && guaranteedCall) return false;
    if (action.type === "call" && bounds.maximum === 0) return false;
    if (forcedSplit && (canCheck || guaranteedCall) &&
      (action.type === "bet" || action.type === "raise")) return false;
    return true;
  });
}
