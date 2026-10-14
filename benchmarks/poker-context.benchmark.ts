import { describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { JevPokerBot } from "@/lib/bots/jev";
import { LlmPokerBot } from "@/lib/bots/llm";
import { LlmPokerBot as BaselineLlm } from "./baselines/llm-v2";
import { decidePokerAction as baselineJev } from "./baselines/decision-v2";
import { emptyDiagnostics, type PokerBot } from "@/lib/bots/types";
import type { TypesafeDecisionClient } from "@/lib/typesafe/decision";
import { TypesafeSystemOneClient } from "@/lib/typesafe/client";
import { getLlmBotModels } from "@/lib/env/server";
import { compareVariants, evaluatePreflop, liveDecisionBudget, type EvaluationVariant } from "./poker-context-harness";
import { pilotCases, pilotVariants, evaluatePilotCases, summarizePilot, evaluatePilotMatches, fixedOpponent } from "./heads-up-pilot";
import { EquityRulesV2Bot } from "@/lib/bots/equity-rules-v2";

function save(report: unknown, name: string) {
  mkdirSync("benchmarks/results",{ recursive:true });
  writeFileSync(`benchmarks/results/${name}.json`,JSON.stringify(report,null,2));
}
const offlineJev: TypesafeDecisionClient = {
  async evaluate(request) {
    const choices=Object.keys(request.questions.move.criteria);
    const choice=choices.find(c => c === "check" || c === "call") ?? choices[0];
    return { answers:{ move:{ type:"choice",choice,probabilities:Object.fromEntries(choices.map(c => [c,c === choice ? 1 : 0])),confidence:1 } } };
  },
};
const offlineLlm = async (_url:string, init:RequestInit) => {
  const request=JSON.parse(String(init.body));
  const schema=request.response_format.json_schema.schema.properties;
  const action=schema.action.enum.find((a:string) => a === "check" || a === "call") ?? schema.action.enum[0];
  const sizing=action === "bet" || action === "raise" ? schema.sizing.enum.find((s:string|null) => s !== null && s !== "not_applicable") : null;
  return new Response(JSON.stringify({ choices:[{ message:{ content:JSON.stringify({ action,sizing }) } }] }));
};
function jevVariants(client: TypesafeDecisionClient): Record<EvaluationVariant,PokerBot> {
  return { baseline:{ async decide(context) {
    const callCost=context.analysis.callCost;
    const result=await baselineJev(client,{ ...context,hero:{ ...context.hero,amountToCall:callCost },
      analysis:{ ...context.analysis,potOddsToCall:context.analysis.contestablePotAfterCall > 0 ? callCost/context.analysis.contestablePotAfterCall : 0 } });
    return { action:result.action,rawResponse:result.rawResponse,diagnostics:emptyDiagnostics({ promptVersion:"typesafe-poker-v2.1" }) };
  } }, facts:new JevPokerBot(client, false), "facts-guidance":new JevPokerBot(client) };
}
function llmVariants(modelId:string, profileId:"balanced"|"tight"|"aggressive", fetcher?: typeof offlineLlm): Record<EvaluationVariant,PokerBot> {
  const reasoning=getLlmBotModels().find(model => model.modelId === modelId)?.reasoning ?? "minimal";
  return { baseline:new BaselineLlm(modelId,{ profileId,reasoning },fetcher),
    facts:new LlmPokerBot(modelId,{ profileId,reasoning,guidance:false },fetcher),
    "facts-guidance":new LlmPokerBot(modelId,{ profileId,reasoning },fetcher) };
}

describe("shared poker context evaluation", () => {
  it("runs offline production wrappers across all classes and seeded 2/6-seat matches", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED","true");
    vi.stubEnv("LLM_API_ENDPOINT","https://offline.invalid/chat/completions");
    vi.stubEnv("LLM_API_KEY","offline-placeholder");
    try {
      const preflop=[];
      for (const [provider,variants] of [["jev",jevVariants(offlineJev)],["llm",llmVariants("mocked-model","balanced",offlineLlm)]] as const) {
        for (const variant of ["baseline","facts","facts-guidance"] as const) {
          const report=await evaluatePreflop(variants[variant],variant,2,{ equitySamples:5 });
          expect(report.nodes.every(node => node.failures === 0)).toBe(true);
          preflop.push({ provider,model:provider === "jev" ? "mocked-jev" : "mocked-model",playstyle:provider === "llm" ? "balanced" : null,...report });
        }
      }
      const variants=llmVariants("mocked-model","balanced",offlineLlm), matches=[];
      for (const seats of [2,6] as const) {
        const match=await compareVariants(variants,new EquityRulesV2Bot(),seats,[1,2,3,4],1);
        expect(match.failures).toBe(0);
        matches.push({ model:"mocked-model",playstyle:"balanced",...match });
      }
      save({ kind:"offline-wrapper-correctness",notPlayingStrength:true,equitySamples:5,preflop,matches },"poker-context-offline");
      console.log(JSON.stringify({ kind:"offline-wrapper-correctness",nodes:preflop.map(report => ({ provider:report.provider,variant:report.variant,nodes:report.nodes.map(({ usage,...node }) => ({ ...node,usageRecords:usage.length })) })),matches:matches.map(({ rows,...match }) => ({ ...match,hands:rows.length })) },null,2));
    } finally { vi.unstubAllEnvs(); }
  },120_000);

  it("runs the fixed heads-up pilot and all playstyles with offline providers", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
    vi.stubEnv("LLM_API_ENDPOINT", "https://offline.invalid/chat/completions");
    vi.stubEnv("LLM_API_KEY", "offline-placeholder");
    try {
      const cases = pilotCases(5);
      const budget = { remaining: 1000 };
      const rows = await evaluatePilotCases(pilotVariants(offlineJev, offlineLlm), budget, cases);
      expect(rows).toHaveLength(640);
      expect(budget.remaining).toBe(360);
      expect(rows.every(row => !row.failure)).toBe(true);
      for (const profileId of ["balanced", "tight", "aggressive"] as const) for (const fixture of cases) {
        const decision = await new LlmPokerBot("mocked-model", { profileId }, offlineLlm).decide(fixture.context);
        expect(fixture.forbidden).not.toContain(decision.action.type);
      }
      save({ kind: "heads-up-offline-wiring", notPlayingStrength: true, summaries: summarizePilot(rows) }, "heads-up-offline");
    } finally { vi.unstubAllEnvs(); }
  }, 120_000);

  it.skipIf(process.env.BOT_SCENARIO_LIVE !== "true")("runs capped live comparisons only on explicit opt-in", async () => {
    const budget=liveDecisionBudget(); // Validate all flags/cap before creating a provider.
    if (budget.remaining > 1000) throw new Error("Heads-up pilot cap must not exceed 1000 requests");
    if (budget.remaining < 640) throw new Error("Heads-up pilot requires at least 640 requests for complete decision blocks");
    const originalCap = budget.remaining;
    const variants = pilotVariants(new TypesafeSystemOneClient());
    let rows: Awaited<ReturnType<typeof evaluatePilotCases>> = [];
    let matchRows: unknown = [];
    let matches: Awaited<ReturnType<typeof evaluatePilotMatches>> | null = null;
    const report = () => ({ kind: "heads-up-live-pilot", originalCap, usedRequests: originalCap - budget.remaining,
      remainingCallCap: budget.remaining, cases: 40, repetitions: 2, summaries: summarizePilot(rows), rows, matchRows, matches });
    try {
      rows = await evaluatePilotCases(variants, budget, pilotCases(), partial => {
        rows = [...partial]; save(report(), "poker-context-live");
      });
      matches = await evaluatePilotMatches(variants, budget, {
        rules: new EquityRulesV2Bot(), aggressive: fixedOpponent(true), passive: fixedOpponent(false),
      }, partial => { matchRows = partial; save(report(), "poker-context-live"); });
      expect(rows).toHaveLength(640);
      expect(rows.every(row => !row.failure)).toBe(true);
    } finally { save(report(), "poker-context-live"); }

  },3_600_000);
});
