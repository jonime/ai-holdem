import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { EquityRulesV2Bot } from "@/lib/bots/equity-rules-v2";
import { representationCases, representations, materialize, version, type AuditCase } from "./fixtures";
import { mapping } from "./transform";
import { mechanicalView, differences } from "./mechanics";
import { liveBot, configuration, assertRegistry } from "./providers";
import { summarize, type Observation } from "./report";
import { Ledger, digest, atomicWrite, preflight, verifyFreeze } from "./safety";
import freeze from "./freeze.json" with { type: "json" };
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
export { observe } from "./observation";
export { schedule } from "./plan";
import { preparePilot } from "./plan";
import { observe } from "./observation";
export function mechanics(fixtures: readonly AuditCase[], samples = 5000) {
  return fixtures.flatMap(f => {
    const original = mechanicalView(f.context,mapping(f.spec,"original"));
    return representations.map(representation => {
      const b = materialize(f,representation,samples), controlled = mechanicalView(b.controlled,b.mapping);
      const changed = differences(original,controlled);
      const critical = changed;
      if (critical.length) throw new Error(`${f.id}/${representation}: invariant mismatch: ${critical.join(",")}`);
      return { fixture:f.id, representation, controlledDifferences:changed, canonicalEquity:f.context.analysis.showdownEquity,nativeEquity:b.native.analysis.showdownEquity,equitySamples:samples,
        nativeDifferences:differences(original,mechanicalView(b.native,b.mapping)), originalHash:digest(original), controlledHash:digest(controlled), substitutedField:"analysis.showdownEquity", inputHash:digest(b.controlled), nativeFactsHash:digest(b.native.facts), canonicalFactsHash:digest(f.context.facts) };
    });
  });
}
export async function offline() {
  if (process.env.EXTERNAL_INFERENCE_ENABLED !== "false") throw new Error("Offline audit must explicitly disable external inference");
  verifyFreeze(freeze.files); assertRegistry();
  const fixtures=representationCases(), mechanical=mechanics(fixtures), rows: Observation[]=[];
  const prepared=preparePilot(freeze.files,fixtures);
  const planPath="benchmarks/bot-audit/pilot-plan.json";
  if (existsSync(planPath)) {
    if (digest(JSON.parse(readFileSync(planPath,"utf8")))!==digest(prepared.manifest)) throw new Error("Frozen pilot inputs changed; preserve the old plan and create a new audit version");
  } else writeFileSync(planPath,JSON.stringify(prepared.manifest,null,2)+"\n",{flag:"wx"});
  console.log("Validated and froze all 972 paid decision slots without inference");
  const bot=new EquityRulesV2Bot();
  // Independent worker partitions retain production 5,000-sample equity. Each
  // worker has no provider credentials, no environment-file loader and no fetch.
  const workers: Worker[]=[];
  try {
    const count=Math.min(4,availableParallelism());
    const parts=await Promise.all(Array.from({length:count},(_,partition)=>new Promise<Observation[]>((resolve,reject)=>{
      const worker=new Worker(new URL("./worker.mjs",import.meta.url),{workerData:{partition,count},env:{EXTERNAL_INFERENCE_ENABLED:"false",NODE_ENV:"test"}});
      workers.push(worker);
      worker.on("message", message=>{ if(message.progress) console.log(`Rules worker ${partition+1}: ${message.progress} nodes complete`); else resolve(message.rows); });
      worker.on("error",()=>reject(new Error("Offline rules worker failed")));
      worker.on("exit",code=>{if(code!==0) reject(new Error("Offline rules worker exited unsuccessfully"));});
    })));
    rows.push(...parts.flat());
  } finally { await Promise.all(workers.map(w=>w.terminate())); }
  for (const f of fixtures) for (const representation of representations) {
    const b=materialize(f,representation,5000,true);
    for (const difficulty of ["easy","medium","hard"] as const) for(const mode of ["native","controlled"] as const) for(let rep=0;rep<3;rep++) rows.push(await observe(bot,f,b,"rules",rep,mode,difficulty));
  }
  if(rows.some(r=>r.failure)) throw new Error("Offline audit contained rejected decisions");
  const evidence={version,kind:"offline",sourceFreeze:freeze.files,configuration,mechanical,rows};
  writeFileSync("benchmarks/bot-audit/offline-evidence.json.gz",gzipSync(JSON.stringify(evidence)));
  atomicWrite("benchmarks/bot-audit/offline-summary.json",summarize(rows));
  return evidence;
}
export async function live() {
  const cap=preflight(); verifyFreeze(freeze.files); assertRegistry();
  const expected=JSON.parse(readFileSync("benchmarks/bot-audit/pilot-plan.json","utf8"));
  if (digest(expected)!==freeze.planHash) throw new Error("Frozen pilot manifest changed");
  const prepared=preparePilot(freeze.files), {fixtures,plan,cache}=prepared;
  if(digest(prepared.manifest)!==freeze.planHash) throw new Error("Controlled input freeze mismatch");
  const mechanical=mechanics(fixtures.filter(f=>f.section==="representation"));
  const manifest={...prepared.manifest,files:freeze.files,cap,mechanical};
  const ledger=new Ledger("benchmarks/bot-audit/live-ledger.json",cap,manifest), rows: Observation[]=[];
  for(const [index,entry] of plan.entries()) {
    const {fixture:f,provider,representation,repetition}=entry, b=cache.get(`${f.id}:${representation}`)!;
    const slot=ledger.reserve({id:`decision-${index}`,provider,fixture:f.id,representation,repetition,inputHash:digest(b.controlled)});
    const row=await observe(liveBot(provider,()=>ledger.request(slot)),f,b,provider,repetition,"controlled");
    ledger.complete(slot,row); rows.push(row);
    atomicWrite("benchmarks/bot-audit/live-summary.json",summarize(rows,fixtures.filter(f=>f.section==="representation").flatMap(f=>["jev","eevo","llm"].map(provider=>({provider:provider as "jev"|"eevo"|"llm",difficulty:"medium" as const,mode:"controlled" as const,fixture:f.id})))));
  }
  return {rows,summary:summarize(rows)};
}
