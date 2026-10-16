import { z } from "zod";
import { selectJevOpponentAdvice } from "@/lib/poker/opponent-advice";
import { prepareProviderContext } from "@/lib/poker/provider-context";
import type { PokerBot } from "@/lib/bots/types";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { representationCases, preflopCases, materialize } from "../bot-audit/fixtures";
import { observationSchema, distribution, tv } from "../bot-audit/report";
import { diagnostics, failure, liveBot } from "../bot-audit/providers";
import { normalizedDecision } from "../bot-audit/mechanics";
import { canonicalBot, canonicalContext } from "./canonical";
import { digest } from "../bot-audit/safety";

export const version = "bot-improvements-v1";
export const policies = ["baseline", "canonical"] as const;
export const providers = ["jev", "llm"] as const;
export const rowSchema = observationSchema.extend({ repetition: z.number().int().min(0).max(9), policyArm: z.enum(policies), failureStage:z.enum(["decision","engine"]).nullable() });
export type Row = z.infer<typeof rowSchema>;
export function prepare(samples = 5000) {
  const fixtures = [...representationCases(samples).filter(f => ["3-preflop-suited","4-turn-draw","5-river-board-kicker","HU-turn-capped-call"].includes(f.id)),
    ...preflopCases(samples).filter(f => ["AA","KK","QQ","JJ","AKo"].includes(f.hand!))];
  const cache = new Map<string, ReturnType<typeof materialize>>(fixtures.flatMap(f => (f.section === "preflop" ? ["original"] as const : ["original","hole-order","seats"] as const)
    .map(r => [`${f.id}:${r}`, materialize(f,r,samples)] as const)));
  const plan: { id: string; provider: typeof providers[number]; policyArm: typeof policies[number]; fixture: string;
    representation: Row["representation"]; repetition: number; inputHash: string }[] = [];
  // Fixed rotations interleave arms/providers and retain matched repetition indices.
  for (let repetition=0;repetition<10;repetition++) for (let i=0;i<fixtures.length;i++) {
    const f = fixtures[(i+repetition)%fixtures.length];
    if (f.section === "preflop" && repetition>=3) continue;
    const reps = f.section === "preflop" ? ["original"] as const : ["original","hole-order","seats"] as const;
    for (let j=0;j<reps.length;j++) for (let k=0;k<4;k++) {
      const representation = reps[(j+repetition)%reps.length], provider = providers[(k+repetition)%2], policyArm = policies[(Math.floor(k/2)+repetition)%2];
      const context = cache.get(`${f.id}:${representation}`)!.controlled;
      plan.push({ id: `slot-${plan.length}`, provider, policyArm, fixture:f.id, representation,repetition,
        inputHash:digest(policyArm === "canonical" ? canonicalContext(context) : context) });
    }
  }
  if (plan.length !== 600) throw new Error("Incorrect fixed allocation");
  return { fixtures,cache,plan };
}
export async function observe(bot: PokerBot, entry: ReturnType<typeof prepare>["plan"][number], prepared: ReturnType<typeof prepare>): Promise<Row> {
  const f = prepared.fixtures.find(f => f.id === entry.fixture)!;
  const b = prepared.cache.get(`${f.id}:${entry.representation}`)!;
  const context = b.controlled;
  if (digest(entry.policyArm === "canonical" ? canonicalContext(context) : context)!==entry.inputHash) throw new Error("Input hash mismatch");
  const row: Row = { provider:entry.provider, policyArm:entry.policyArm, fixture:f.id,section:f.section,hand:f.hand,weight:f.weight,
    difficulty:"medium",representation:entry.representation,mode:"controlled",repetition:entry.repetition,action:null,failure:null,failureStage:null,latencyMs:0,
    probabilities:null,sizingProbabilities:null,confidence:null,policy:null,model:null,usage:{},cost:null,adviceItems:entry.provider === "jev" ? selectJevOpponentAdvice(prepareProviderContext(entry.policyArm === "canonical" ? canonicalContext(context) : context)).length : 0 };
  let stage: "decision"|"engine" = "decision";
  const start = performance.now();
  try {
    const d = await (entry.policyArm === "canonical" ? canonicalBot(bot) : bot).decide(structuredClone(context));
    Object.assign(row,diagnostics(d));
    if (entry.provider === "llm" && row.model !== "openai/gpt-5.4-mini") throw new Error("Unexpected model");
    stage = "engine";
    engine.applyAction(b.state,engine.snapshot(b.state).currentActorId!,d.action);
    row.action = normalizedDecision(d.action,context);
  } catch (error) { row.failure = failure(error); row.failureStage=stage; }
  row.latencyMs = Math.round(performance.now()-start);
  return rowSchema.parse(row);
}
export { liveBot };
export function analyze(input: readonly unknown[]) {
  const rows = input.map(row => rowSchema.parse(row));
  const cells = [...new Set(rows.map(r => [r.provider,r.policyArm,r.fixture,r.representation].join(":")))].map(key => {
    const selected = rows.filter(r => [r.provider,r.policyArm,r.fixture,r.representation].join(":")===key), good = selected.filter(r => r.action && !r.failure);
    const keys = good.map(r => JSON.stringify(r.action));
    const pairCount = keys.length*(keys.length-1)/2;
    return {key,attempts:selected.length,successes:good.length,failures:selected.length-good.length,
      actionAndSize:distribution(keys),actionOnly:distribution(good.map(r => r.action!.type)),
      sameInputDisagreement:pairCount ? keys.flatMap((k,i) => keys.slice(i+1).map(j => Number(k!==j))).reduce((a,b)=>a+b,0)/pairCount : null};
  });
  const contrasts = providers.flatMap(provider => policies.flatMap(policyArm => [...new Set(rows.filter(r => r.section === "representation").map(r => r.fixture))].flatMap(fixture => ["hole-order","seats"].map(representation => {
    const selected = rows.filter(r => r.provider===provider && r.policyArm===policyArm && r.fixture===fixture);
    const pairs = Array.from({length:10},(_,i) => [selected.find(r => r.representation==="original" && r.repetition===i),selected.find(r => r.representation===representation && r.repetition===i)])
      .filter((p): p is [Row,Row] => p.every(r => !!r?.action && !r.failure));
    return {provider,policyArm,fixture,representation,completePairs:pairs.length,excludedPairs:10-pairs.length,
      actionAndSizeTV:tv(pairs.map(p => JSON.stringify(p[0].action)),pairs.map(p => JSON.stringify(p[1].action))),
      actionOnlyTV:tv(pairs.map(p => p[0].action!.type),pairs.map(p => p[1].action!.type))};
  }))));
  const reliability = providers.flatMap(provider => policies.map(policyArm => {
    const selected=rows.filter(r=>r.provider===provider&&r.policyArm===policyArm), costs=selected.filter(r=>r.cost!==null), latencies=selected.map(r=>r.latencyMs).sort((a,b)=>a-b);
    return {provider,policyArm,attempts:selected.length,failures:selected.filter(r=>r.failure).length,costCoverage:costs.length,
      reportedCost:costs.length ? costs.reduce((s,r)=>s+r.cost!,0) : null,medianMs:latencies[Math.floor(latencies.length*.5)]??null,p95Ms:latencies[Math.floor(latencies.length*.95)]??null,
      models:[...new Set(selected.map(r=>r.model))]};
  }));
  return {version,rows:rows.length,cells,contrasts,reliability};
}
