/** Dormant until a source passes an independent audit; never called by the memory-only command. */
import type { TypesafeDecisionClient } from "@/lib/typesafe/decision";
import { EquityRulesV2Bot } from "@/lib/bots/equity-rules-v2";
import { fixedOpponent } from "../heads-up-pilot";
import { chartVariants, pairedMatches, type RequestBudget, type MatchRow } from "./experiment";
import { matchReference, seededRandom, type Reference, type Match } from "./reference";
export async function evaluateChartMatches(data: Reference, client: TypesafeDecisionClient, budget: RequestBudget, blocks: number,
  progress: (rows: readonly MatchRow[]) => void = () => {}) {
  let resolve: (context: Parameters<typeof matchReference>[3]) => Match = () => ({ supported: false, reason: "no_authoritative_fixture" });
  const variants = chartVariants(budget.client(client, "matches"), data, context => resolve(context), seededRandom(9301));
  const report = await pairedMatches(variants.current, { advisory: variants.advisory, hybrid: variants.hybrid }, {
    rules: new EquityRulesV2Bot(), passive: fixedOpponent(false), aggressive: fixedOpponent(true),
  }, blocks, progress, (state, history) => { resolve = context => matchReference(data, state, history, context); });
  return { ...report, coverage: variants.coverage, policyVersion: "typesafe-poker-v4.0", dataVersion: data.dataVersion, providerRequests: budget.allocations.matches };
}
