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
import { cappedBot, compareVariants, evaluatePreflop, liveDecisionBudget, type EvaluationVariant } from "./poker-context-harness";
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
  } }, facts:new JevPokerBot(client), "facts-guidance":new JevPokerBot(client) };
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
          if (provider === "jev" && variant === "facts-guidance") continue;
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

  it.skipIf(process.env.BOT_SCENARIO_LIVE !== "true")("runs capped live comparisons only on explicit opt-in", async () => {
    const budget=liveDecisionBudget(); // Validate all flags/cap before creating a provider.
    const repetitions=Number(process.env.BOT_EVAL_REPETITIONS ?? "2");
    if (!Number.isSafeInteger(repetitions) || repetitions < 1) throw new Error("Invalid BOT_EVAL_REPETITIONS");
    const families: { provider:string; model:string; playstyle:string|null; variants:Record<EvaluationVariant,PokerBot> }[] = [
      { provider:"jev",model:"jev-latest",playstyle:null,variants:jevVariants(new TypesafeSystemOneClient()) },
      ...getLlmBotModels().flatMap(model => (["balanced","tight","aggressive"] as const).map(playstyle => ({ provider:"llm",model:model.modelId,playstyle,variants:llmVariants(model.modelId,playstyle) }))),
    ];
    const reports:unknown[]=[];
    let partial:unknown=null;
    try {
      for (const family of families) {
        const capped=Object.fromEntries(Object.entries(family.variants).map(([key,bot]) => [key,cappedBot(bot,budget)])) as Record<EvaluationVariant,PokerBot>;
        const preflop=[];
        for (const variant of ["baseline","facts","facts-guidance"] as const) {
          if (family.provider === "jev" && variant === "facts-guidance") continue;
          preflop.push(await evaluatePreflop(capped[variant],variant,repetitions,{ onProgress:rows => { partial={ provider:family.provider,model:family.model,playstyle:family.playstyle,variant,phase:"preflop",rows }; } }));
        }
        const matches=[];
        for (const seats of [2,6] as const) matches.push(await compareVariants(family.provider === "jev" ? { baseline:capped.baseline,facts:capped.facts } : capped,new EquityRulesV2Bot(),seats,[1,2,3,4,5],repetitions,rows => { partial={ provider:family.provider,model:family.model,playstyle:family.playstyle,seats,phase:"matches",rows }; }));
        reports.push({ provider:family.provider,model:family.model,playstyle:family.playstyle,preflop,matches });
        expect(preflop.every(report => report.nodes.every(node => node.failures === 0))).toBe(true);
        expect(matches.every(report => report.failures === 0)).toBe(true);
      }
    } finally { save({ kind:"live-provider-evaluation",remainingCallCap:budget.remaining,reports,partial },"poker-context-live"); }
  },3_600_000);
});
