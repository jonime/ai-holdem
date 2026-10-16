import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalContext, canonicalSeed, frequency, canonicalBot } from "./canonical";
import { prepare,analyze,observe } from "./experiment";
import { Ledger,preflight } from "./ledger";
import { materialize, representations } from "../bot-audit/fixtures";
import { mechanicalView } from "../bot-audit/mechanics";
import { mapping } from "../bot-audit/transform";
import { emptyDiagnostics } from "@/lib/bots/types";
import { EquityRulesV2Bot } from "@/lib/bots/equity-rules-v2";
import { playHand } from "../equity-rules/experiment";
import { candidate, traces, compare } from "./offline";
let p: ReturnType<typeof prepare>;
beforeAll(()=>{p=prepare(8);},120000);
describe("isolated improvement pilot",()=>{
  it("allocates exactly 600 interleaved slots with no Eevo",()=>{
    expect(p.plan).toHaveLength(600);
    expect(new Set(p.plan.map(e=>e.id)).size).toBe(600);
    for(const provider of ["jev","llm"]) for(const policyArm of ["baseline","canonical"]) {
      const entries=p.plan.filter(e=>e.provider===provider&&e.policyArm===policyArm);
      expect(entries).toHaveLength(150);
      expect(entries.filter(e=>e.fixture.startsWith("HU-open-")||e.fixture.startsWith("HU-defend-"))).toHaveLength(30);
    }
    expect(new Set(p.plan.map(e=>e.provider))).toEqual(new Set(["jev","llm"]));
  });
  it("canonicalizes equivalent inputs identically and idempotently",()=>{
    for(const f of p.fixtures) {
      const c=canonicalContext(materialize(f,"original",8).controlled);
      expect(canonicalContext(c)).toEqual(c);
      for(const rep of ["hole-order","seats"] as const) expect(canonicalContext(materialize(f,rep,8).controlled)).toEqual(c);
    }
  });
  it("preserves semantic mechanics, chronology, money, and remapped advice",()=>{
    for(const f of p.fixtures) {
      const c=materialize(f,"original",8).controlled, normalized=canonicalContext(c);
      const m={...mapping(f.spec,"original"),rotation:-c.hero.seat};
      expect(mechanicalView(normalized,m)).toEqual(mechanicalView(c,mapping(f.spec,"original")));
      expect(normalized.hand.communityCards).toEqual(c.hand.communityCards);
      expect(normalized.legalActions).toEqual(c.legalActions);
      expect(normalized.actionHistory.map(a=>a.sequence)).toEqual(c.actionHistory.map(a=>a.sequence));
    }
  });
  it("keeps the Rules choice seed invariant under all transforms",()=>{
    for(const f of p.fixtures.filter(f=>f.section==="representation")) {
      const original=materialize(f,"original",8,true).controlled;
      const seed=canonicalSeed(original);
      for(const rep of representations) expect(canonicalSeed(materialize(f,rep,8,true).controlled)).toBe(seed);
      expect(canonicalSeed({...original,game:{...original.game,handNumber:original.game.handNumber+1}})).not.toBe(seed);
    }
  });
  it("uses only visible cards and rejects invalid seat references",()=>{
    const c=p.cache.values().next().value!.controlled;
    expect(()=>canonicalContext({...c,actionHistory:[...c.actionHistory,{sequence:100,street:"turn",action:"check",amount:null,actorSeat:999,actor:"opponent",controller:"bot"}]})).toThrow("Unmapped");
    expect(JSON.stringify(canonicalContext(c))).not.toMatch(/playerToken|initialState|providerResponse/);
  });
  it("validates candidate decisions against the original engine",async()=>{
    const entry=p.plan.find(e=>e.policyArm==="canonical")!;
    const bot={async decide(c: Parameters<typeof canonicalContext>[0]) { expect(c.hero.seat).toBe(0);return {action:c.legalActions.find(a=>a.type==="check")??c.legalActions.find(a=>a.type==="call")??{type:"fold" as const},diagnostics:emptyDiagnostics(),rawResponse:null};}};
    const row=await observe(bot,entry,p);
    expect(row.failure).toBeNull();expect(row.action).not.toBeNull();
    const wrapped=canonicalBot(bot);expect(await wrapped.decide(p.cache.get(`${entry.fixture}:${entry.representation}`)!.controlled)).toBeDefined();
  });
  it("changes only hash-dependent Rules branches",async()=>{
    const baseline=new EquityRulesV2Bot();
    for(const f of p.fixtures) {
      const c=materialize(f,"original",8,true).controlled;
      for(const difficulty of ["easy","medium","hard"] as const) {
        const before=await baseline.decide({...c,difficulty}),after=await candidate.decide({...c,difficulty});
        if(difficulty==="easy" || before.diagnostics.matchedRule==="rules-value-bet") expect(after.action).toEqual(before.action);
      }
    }
    expect(frequency(canonicalSeed(p.cache.values().next().value!.controlled))).toBeGreaterThanOrEqual(0);
  });
  it("traces active-opponent and price arithmetic without changing preflop strategy",async()=>{
    const rows=await traces(8);expect(rows).toHaveLength(165);
    expect(rows.every(r=>r.opponentsMatchSituation)).toBe(true);
    expect(rows.filter(r=>r.node==="six-open-UTG").every(r=>r.activeOpponents===5)).toBe(true);
  },30000);
  it("excludes whole incomplete match blocks",async()=>{
    const result=await compare("passive","easy",2,2,2);
    expect(result.profits).toHaveLength(8);expect(result.completeBlocks+result.excluded.length).toBe(2);
    expect(result.paired).not.toBeNull();
    const failed=await compare("passive","easy",2,2,2,async (...args)=>{if(args[5]===1 && args[4]===0) throw new Error("fixture failure");return playHand(...args);});
    expect(failed.excluded).toEqual([1]);expect(failed.completeBlocks).toBe(1);expect(failed.paired).toBeNull();
  },30000);
  it("rejects replay, duplicate requests and mismatched completions",async()=>{
    const dir=mkdtempSync(join(tmpdir(),"improvement-ledger-"));
    try {
      const ledger=new Ledger(join(dir,"ledger.json"),{}), entry=p.plan[0],slot=ledger.reserve(entry);
      expect(()=>ledger.reserve(entry)).toThrow();ledger.request(slot);expect(()=>ledger.request(slot)).toThrow();
      const row=await observe({async decide(c){return {action:c.legalActions.find(a=>a.type==="call")??{type:"fold" as const},diagnostics:emptyDiagnostics(),rawResponse:null};}},entry,p);
      expect(()=>ledger.complete(slot,{...row,repetition:9})).toThrow();
      ledger.complete(slot,row);expect(()=>ledger.complete(slot,row)).toThrow();
      const capLedger=new Ledger(join(dir,"cap.json"),{});
      for(const item of p.plan) capLedger.reserve(item);
      expect(()=>capLedger.reserve({...entry,id:"extra"})).toThrow();
      expect(()=>new Ledger(join(dir,"ledger.json"),{})).toThrow();
      expect(analyze([row]).rows).toBe(1);
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
  it("requires the exact approved cap and only Jev/OpenRouter credentials",()=>{
    const env={BOT_IMPROVEMENTS_AUTHORIZATION:"approved-600-jev-openrouter-v1",BOT_DECISION_CALL_CAP:"600",EXTERNAL_INFERENCE_ENABLED:"true",TYPESAFE_API_KEY:"mock",LLM_API_KEY:"mock",LLM_API_ENDPOINT:"https://openrouter.ai/api/v1/chat/completions"};
    expect(()=>preflight(env)).not.toThrow();
    for(const cap of ["599","601",""]) expect(()=>preflight({...env,BOT_DECISION_CALL_CAP:cap})).toThrow();
    expect(()=>preflight({...env,BOT_IMPROVEMENTS_AUTHORIZATION:""})).toThrow();
  });
});
