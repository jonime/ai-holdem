import type { BotContext } from "@/lib/bots/types";
import type { Observation } from "@/lib/poker/session-stats";

export const adviceVersion = "opponent-fold-advice-v1";
export function wilson95(count: number, opportunities: number): readonly [number, number] | null {
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(opportunities) || count < 0 || opportunities < 0 || count > opportunities) throw new Error("Invalid observation counts");
  if (!opportunities) return null;
  const z = 1.959963984540054, n = opportunities, p = count / n;
  const divisor = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / divisor;
  const margin = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / divisor;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}
export function tendency(observation: Observation) {
  const interval = wilson95(observation.count, observation.opportunities);
  if (observation.opportunities < 10 || !interval) return null;
  return interval[0] > 0.60 ? { kind: "frequent_folding" as const, interval }
    : interval[1] < 0.30 ? { kind: "frequent_continuation" as const, interval } : null;
}
/** Reads only seat-relative validated aggregates and the visible decision line. */
export function opponentAdvice(context: BotContext) {
  const stats = context.sessionStats, situation = context.situation;
  if (!stats || stats.version !== "poker-session-stats-v1" || situation?.historyStatus !== "complete" || situation.dealtPlayerCount === undefined) return [];
  const bucket = situation.dealtPlayerCount === 2 ? "headsUp" : "multiway";
  return context.opponents.filter(p => p.status === "active" && p.stack > 0).flatMap(opponent => {
    const participant = stats.participants.find(p => p.role === "opponent" && p.seat === opponent.seat);
    if (!participant) return [];
    let metric: "bbSmallOpenFold" | "bbLargeOpenFold" | "flopFoldFacingBet" | "turnFoldFacingBet" | "riverFoldFacingBet";
    if (context.hand.street === "preflop") {
      // These observations describe a BB's first response to a HU button open only.
      if (bucket !== "headsUp" || context.hero.position !== "button" || opponent.position !== "big_blind" || situation.preflop !== "unopened" || context.actionHistory.length) return [];
      // Opening-size evidence is conditional on each concrete candidate, never generalized.
      return context.sizingOptions.flatMap(size => {
        if (size.amount === null || !context.legalActions.some(a => a.type === "raise")) return [];
        metric = size.amount / context.game.bigBlind <= 3 ? "bbSmallOpenFold" : "bbLargeOpenFold";
        return describe(participant[bucket][metric], opponent.seat, metric, size.choice, bucket);
      });
    }
    if (!context.legalActions.some(a => a.type === "bet" || a.type === "raise")) return [];
    metric = `${context.hand.street}FoldFacingBet`;
    return describe(participant[bucket][metric], opponent.seat, metric, null, bucket);
  });
}
function describe(observation: Observation, seat: number, metric: string, sizing: string | null, bucket: string) {
  const result = tendency(observation);
  if (!result) return [];
  return [{ version: adviceVersion, seat, metric, sizing, bucket, folds: observation.count,
    opportunities: observation.opportunities, confidence95: result.interval, tendency: result.kind,
    text: `${result.kind === "frequent_folding" ? "Consider more pressure against this opponent's observed frequent folds." : "Reduce speculative bluffs and seek worse continuing hands against this opponent's observed frequent continuation."} Evidence: ${observation.count}/${observation.opportunities} folds; 95% Wilson interval ${result.interval.map(n => n.toFixed(3)).join("–")}. Conditional on this situation${sizing ? ` and sizing ${sizing}` : ""}; uncertain recorded behavior, not a known range. This describes only seat ${seat}; it does not estimate everyone's fold probability. Keep all candidates, exact safeguards and playstyle boundaries.` }];
}
