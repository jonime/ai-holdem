// Offline analysis of a sanitized local run; never loads credentials or contacts providers.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error("Usage: node analyze.mjs RUN.json ANALYSIS.json");
const report = JSON.parse(readFileSync(input, "utf8"));
if (report.fixtureVersion !== "opponent-advice-twelve-v2" || !Array.isArray(report.rows) || report.rows.length > 960 || report.attempts > 960) throw new Error("Unexpected v2 ledger");
const rows = report.rows;
const successful = rows.filter(row => row.action !== null);
const move = row => JSON.parse(row.action).type;
const aggressive = row => ["bet", "raise"].includes(move(row));
const quantile = (values, q) => values.length ? [...values].sort((a,b) => a-b)[Math.min(values.length - 1, Math.floor(values.length*q))] : null;
const providerNames = ["jev", "mini"];
const conditions = ["omitted", "insufficient", "folding", "continuation"];
const policies = ["current", "advice"];
const providers = providerNames.map(provider => {
  const selected = rows.filter(r => r.provider === provider), success = selected.filter(r => r.action !== null);
  const costs = success.filter(r => Number.isFinite(r.diagnostics?.cost));
  const tokens = Object.fromEntries(["input", "output", "total"].map(key => {
    const covered = success.filter(r => Number.isFinite(r.diagnostics?.tokens?.[key]));
    return [key, { reported: covered.reduce((n,r) => n+r.diagnostics.tokens[key],0), coveredRequests: covered.length }];
  }));
  return { provider, attempts: selected.length, successes: success.length, failures: selected.filter(r => r.failure).length,
    reportedCost: costs.length ? costs.reduce((n,r) => n+r.diagnostics.cost,0) : null, costCovered: costs.length,
    latencyMs: { median: quantile(success.map(r => r.latencyMs),.5), p95: quantile(success.map(r => r.latencyMs),.95) }, tokens };
});
const pairs = providerNames.flatMap(provider => conditions.map(condition => {
  let complete = 0, changedActionOrSize = 0, changedActionType = 0, eligible = 0;
  for (const fixture of new Set(rows.map(r => r.fixture))) for (let repetition=0;repetition<5;repetition++) {
    const pair = rows.filter(r => r.fixture===fixture&&r.provider===provider&&r.condition===condition&&r.repetition===repetition);
    if (pair.length !== 2 || pair.some(r => r.action===null) || new Set(pair.map(r => r.policy)).size!==2) continue;
    complete++; changedActionOrSize+=Number(pair[0].action!==pair[1].action); changedActionType+=Number(move(pair[0])!==move(pair[1])); eligible+=Number(pair.some(r => r.adviceItems>0));
  }
  return { provider, condition, completePairs:complete, excludedPairs:60-complete, changedActionOrSize, changedActionType, adviceEligiblePairs:eligible };
}));
const distributions = providerNames.flatMap(provider => conditions.flatMap(condition => policies.map(policy => {
  const selected = successful.filter(r=>r.provider===provider&&r.condition===condition&&r.policy===policy);
  return { provider, condition, policy, denominator:selected.length,
    actions:Object.fromEntries([...new Set(selected.map(move))].map(type=>[type,selected.filter(r=>move(r)===type).length])),
    sizings:Object.fromEntries([...new Set(selected.map(r=>r.sizing??"none"))].map(size=>[size,selected.filter(r=>(r.sizing??"none")===size).length])) };
})));
const pressure = providerNames.flatMap(provider => {
  const eligibleFixtures = new Set(successful.filter(r=>r.provider===provider&&r.policy==="advice"&&["folding","continuation"].includes(r.condition)&&r.adviceItems>0).map(r=>r.fixture));
  return conditions.flatMap(condition => policies.map(policy => {
    const selected=successful.filter(r=>r.provider===provider&&r.condition===condition&&r.policy===policy&&eligibleFixtures.has(r.fixture));
    const count=selected.filter(aggressive).length;
    return {provider,condition,policy,eligibleFixtureCount:eligibleFixtures.size,denominator:selected.length,aggressiveActions:count,aggressiveRate:selected.length?count/selected.length:null};
  }));
});
const effects=providerNames.map(provider=>{
  const delta=condition=>{const current=pressure.find(r=>r.provider===provider&&r.condition===condition&&r.policy==="current"), advice=pressure.find(r=>r.provider===provider&&r.condition===condition&&r.policy==="advice");return current.aggressiveRate===null||advice.aggressiveRate===null?null:advice.aggressiveRate-current.aggressiveRate;};
  const folding=delta("folding"), continuation=delta("continuation");
  return {provider,adviceMinusCurrentAggression:{omitted:delta("omitted"),insufficient:delta("insufficient"),folding,continuation},foldVsContinuationDifference:folding===null||continuation===null?null:folding-continuation,interpretation:"Descriptive fixed-case sensitivity; neither aggression nor this difference is poker quality or win rate."};
});
const analysis={fixtureVersion:report.fixtureVersion,adviceVersion:report.adviceVersion,inputHash:report.inputHash,reportSha256:createHash("sha256").update(readFileSync(input)).digest("hex"),analysisSourceSha256:createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"),cap:report.cap,attempts:report.attempts,successes:successful.length,failures:rows.filter(r=>r.failure).length,stopReason:report.stopReason,completePolicyPairs:pairs.reduce((n,r)=>n+r.completePairs,0),excludedPolicyPairs:pairs.reduce((n,r)=>n+r.excludedPairs,0),providers,pairs,distributions,pressure,effects,insufficientHistoryReviewFlags:report.summary.historyContrasts.filter(r=>r.unsupportedAdaptationFlag).length,limitations:["Fixed synthetic decisions, not win-rate measurement","Repetitions share fixed situations; case mixtures are not population frequencies","Omitted and insufficient policy contrasts are identical-request stochastic controls","History changes on sparse statistics require review, not automatic quality grading","Reported costs may omit Jev and failed-request billing"]};
writeFileSync(output,JSON.stringify(analysis,null,2)+"\n");
console.log(JSON.stringify({attempts:analysis.attempts,successes:analysis.successes,failures:analysis.failures,providers:analysis.providers,pairs:analysis.pairs,effects:analysis.effects},null,2));
