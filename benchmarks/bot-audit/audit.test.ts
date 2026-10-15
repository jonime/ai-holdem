import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { prepareProviderContext } from "@/lib/poker/provider-context";
import { selectJevOpponentAdvice } from "@/lib/poker/opponent-advice";
import { projectBotHistory } from "@/lib/poker/bot-history";
import { ConfidenceAwareJevPokerBot } from "@/lib/bots/jev-confidence";
import { createMoveOptions } from "@/lib/typesafe/questions";
import { emptyDiagnostics } from "@/lib/bots/types";
import { representationCases, preflopCases, handClasses, representations, materialize, botHistory } from "./fixtures";
import { projectSessionStats } from "@/lib/poker/session-stats";
import { recordedHistory } from "../opponent-advice/fixtures";
import { Worker } from "node:worker_threads";
import { replay, specFromHistory } from "./replay-adapter";
import { transform, mapping, seatMap, cardMap, amountMap, remapStats } from "./transform";
import { mechanics, observe, schedule } from "./runner";
import { mechanicalView, differences, normalizedDecision } from "./mechanics";
import { diagnostics, assertRegistry, liveBot } from "./providers";
import { Ledger, preflight, verifyFreeze } from "./safety";
import { distribution, summarize, tv, observationSchema, type Observation } from "./report";
let fixtures: ReturnType<typeof representationCases>;
const directory=mkdtempSync(join(tmpdir(),"bot-audit-test-"));
beforeAll(()=>{ fixtures=representationCases(8); },120000);
afterAll(()=>rmSync(directory,{recursive:true,force:true}));
function row(overrides: Partial<Observation>={}): Observation { return {provider:"jev",fixture:"HU-open-AA",section:"preflop",hand:"AA",weight:6,difficulty:"medium",representation:"original",mode:"controlled",repetition:0,action:{type:"raise",amountBB:3},failure:null,latencyMs:2,probabilities:{raise_to_6:1},sizingProbabilities:null,confidence:1,policy:null,model:null,usage:{},cost:null,adviceItems:0,...overrides}; }
describe("production audit mechanics",()=>{
  it("boots the isolated offline worker without provider credentials or environment loading",async()=>{
    const worker=new Worker(new URL("./worker.mjs",import.meta.url),{workerData:{partition:99,count:100},env:{EXTERNAL_INFERENCE_ENABLED:"false",NODE_ENV:"test"}});
    try { const result=await new Promise((resolve,reject)=>{worker.once("message",resolve);worker.once("error",reject);});expect(result).toEqual({rows:[]}); } finally {await worker.terminate();}
  });
  it("uses the registry's current production confidence wrappers",()=>assertRegistry());
  it("covers exactly the prescribed paid allocation and class weights",()=>{
    const opening=preflopCases(2), plan=schedule([...opening,...fixtures]);
    expect(opening).toHaveLength(48); expect(plan).toHaveLength(972);
    for(const provider of ["jev","eevo","llm"]) {
      expect(plan.filter(p=>p.provider===provider&&p.fixture.section==="preflop")).toHaveLength(144);
      expect(plan.filter(p=>p.provider===provider&&p.fixture.section==="representation")).toHaveLength(180);
    }
    expect(handClasses).toHaveLength(169); expect(handClasses.reduce((s,h)=>s+h.weight,0)).toBe(1326);
    expect(new Set(fixtures.map(f=>f.spec.config.seatCount))).toEqual(new Set([2,3,4,5,6]));
    expect(fixtures.filter(f=>f.spec.config.seatCount===2)).toHaveLength(6);
  });
  it("replays suit, hole, seat and exact amount transformations with inverse mappings",()=>{
    for(const f of fixtures) for(const rep of representations) {
      const m=mapping(f.spec,rep), transformed=transform(f.spec,f.context.hero.seat,m), back=transform(transformed,seatMap(f.context.hero.seat,m),m,true);
      expect(back).toEqual(f.spec);
      const b=materialize(f,rep,8);
      expect(projectBotHistory(b.history,b.state,engine.snapshot(b.state).currentActorId!).status).toBe("complete");
      expect(engine.decisionView(b.state).buttonSeat).toBe(seatMap(f.spec.button,m));
      expect(b.controlled.analysis.showdownEquity).toBe(f.context.analysis.showdownEquity);
      expect(b.controlled.analysis.equitySamples).toBe(8);
      const { showdownEquity: ignored, ...rest }=b.controlled.analysis; void ignored;
      expect(rest).toEqual((({showdownEquity:ignored,...other})=>{void ignored;return other;})(b.native.analysis));
    }
  });
  it("compares legal bounds, prices, facts, statistics, advice and menus before calls",()=>{
    const checked=mechanics(fixtures,8);
    expect(checked).toHaveLength(60);
    expect(checked.every(r=>r.controlledDifferences.length===0)).toBe(true);
    expect(checked.some(r=>r.nativeEquity!==r.canonicalEquity)).toBe(true);
    const capped=fixtures.find(f=>f.id==="HU-turn-capped-call")!;
    expect(capped.context.analysis.callCost).toBe(480);
    const split=fixtures.find(f=>f.id==="HU-river-board-split")!;
    expect(split.context.legalActions.map(a=>a.type)).toEqual(["call"]);
  });
  it("rejects collisions, invalid replay attribution and unsupported scaling",()=>{
    const f=fixtures[2], m=mapping(f.spec,"chips");
    expect(()=>replay({...f.spec,deck:[f.spec.deck[1],...f.spec.deck.slice(1)]})).toThrow(/collision/);
    expect(()=>replay({...f.spec,line:[{seat:99,action:{type:"check"}}]})).toThrow(/actor/);
    expect(()=>transform(f.spec,f.context.hero.seat,{...m,scale:3})).toThrow(/scaling/);
    expect(()=>amountMap(1,m,true)).toThrow(/integral/);
    expect(()=>cardMap("As",{...m,suits:"cccc"})).toThrow();
  });
  it("remaps opponent observations and textual advice references",()=>{
    const f=fixtures[2], m=mapping(f.spec,"seats"), b=materialize(f,"seats",8);
    expect(remapStats(remapStats(f.stats,m),m,true)).toEqual(f.stats);
    const advice=selectJevOpponentAdvice(prepareProviderContext(b.controlled));
    expect(advice.length).toBeGreaterThan(0);
    expect(advice.every(a=>a.text.includes(`seat ${a.seat}`))).toBe(true);
    expect(differences(mechanicalView(f.context,mapping(f.spec,"original")),mechanicalView(b.controlled,m))).toEqual([]);
    expect(selectJevOpponentAdvice(fixtures[3].context)).toEqual([]);
    expect(selectJevOpponentAdvice(fixtures[1].context)).toEqual([]);
  });
  it("replayed historical seat/suit/chip transforms agree with remapped aggregates",()=>{
    const f=fixtures[2], current=replay(f.spec), source=recordedHistory(2,"flop",0,"folding",6);
    const previous=source.hands.map(botHistory);
    const canonical=projectSessionStats({gameId:"synthetic",version:0,currentHand:current.history,previousHands:previous},current.state,engine.snapshot(current.state).currentActorId!);
    for(const rep of ["seats","suits","chips"] as const) {
      const m=mapping(f.spec,rep), b=materialize(f,rep,8);
      const transformed=previous.map(h=>{const spec=specFromHistory("synthetic-history",h.finalState!,h),built=replay(transform(spec,f.context.hero.seat,m));return {...built.history,finalState:built.state};});
      const actual=projectSessionStats({gameId:"synthetic",version:0,currentHand:b.history,previousHands:transformed},b.state,engine.snapshot(b.state).currentActorId!);
      expect(mechanicalView({...b.controlled,sessionStats:actual},m)).toEqual(mechanicalView({...f.context,sessionStats:canonical},mapping(f.spec,"original")));
    }
    const hidden=recordedHistory(2,"flop",0,"folding",6,["Ac","Ad","Kh","Qd"]).hands.map(botHistory);
    const changed=projectSessionStats({gameId:"synthetic",version:0,currentHand:current.history,previousHands:hidden},current.state,engine.snapshot(current.state).currentActorId!);
    expect(changed).toEqual(canonical);
  });
  it("keeps hidden holdings and private historical states out of actual provider requests",async()=>{
    const f=fixtures[2], original=materialize(f,"original",8);
    const hero=engine.snapshot(original.state).currentActorId!, hole=engine.heroCards(original.state,hero);
    const other=original.state.config.players.find(p=>p.id!==hero)!;
    const deck=[...f.spec.deck];
    // Change only this opponent's two deal cards with two unused tail cards.
    const hidden=engine.heroCards(original.state,other.id);
    for(const [i,card] of hidden.entries()) { const at=deck.indexOf(card), tail=50+i; [deck[at],deck[tail]]=[deck[tail],deck[at]]; }
    const changed=materialize({...f,spec:{...f.spec,deck}},"original",8);
    expect(changed.native).toEqual(original.native);
    const seen:unknown[]=[];
    const bot=new ConfidenceAwareJevPokerBot({async evaluate(request){
      seen.push(request); const choices=Object.keys(request.questions.move.criteria!);
      return {answers:{move:{type:"choice",choice:choices[0],confidence:1,probabilities:Object.fromEntries(choices.map(c=>[c,c===choices[0]?1:0]))}}};
    }});
    await bot.decide(original.controlled); await bot.decide(changed.controlled);
    expect(seen[0]).toEqual(seen[1]);
    const serialized=JSON.stringify(seen);
    for(const forbidden of ["playerToken","fixture-","engineState","stateBefore","initialState","finalState","previousHands","holeCards\":[\""+hidden[0]]) expect(serialized).not.toContain(forbidden);
    expect(serialized).toContain(hole[0]);
  });
  it("keeps a failed decision as a failure without fallback",async()=>{
    const f=fixtures[0], b=materialize(f,"original",8);
    const result=await observe({async decide(){throw new Error("secret provider text");}},f,b,"jev",0,"controlled");
    expect(result.action).toBeNull(); expect(result.failure).toBe("provider"); expect(JSON.stringify(result)).not.toContain("secret");
  });
});
describe("audit reporting and execution boundaries",()=>{
  it("reports combination-weighted conditional composition and normalized sizes",()=>{
    const rows=[row(),row({hand:"AKs",weight:4}),row({hand:"72o",weight:12,action:{type:"fold",amountBB:null}})];
    expect(observationSchema.parse(row({fixture:"six-open-small_blind-AA"})).fixture).toBe("six-open-small_blind-AA");
    const report=summarize(rows), action=report.predictability[0];
    expect(action.weightedActions.denominator).toBe(22);
    expect(action.scope).toBe("conditional_on_24_selected_classes");
    expect(Object.values(distribution(["pairs","suited"],[6,4]).frequencies)).toEqual([.6,.4]);
    expect(normalizedDecision({type:"raise",amount:360},fixtures[0].context)).toEqual({type:"raise",amountBB:3});
    expect(tv(["fold","raise"],["raise","raise"])).toBe(.5);
  });
  it("does not interpret model probabilities as empirical strategic frequencies",()=>{
    const report=summarize([row({probabilities:{fold:1}})]);
    expect(report.groups[0].actionOnly.frequencies).toEqual({raise:1});
    expect(report.groups[0].providerProbabilityDiagnostics[0].probabilities).toEqual({fold:1});
    expect(report.groups[0].repeatAgreement).toBeNull();
  });
  it("excludes incomplete repetition pairs and exposes missing comparisons",()=>{
    const rows=[row({section:"representation"}),row({section:"representation",representation:"suits"}),row({section:"representation",repetition:1}),row({section:"representation",repetition:1,representation:"suits",action:null,failure:"timeout"})];
    const result=summarize(rows);
    expect(result.contrasts[0]).toMatchObject({completePairs:1,excludedPairs:2,totalVariation:0});
    expect(result.operational[0].failures).toBe(1);
  });
  it("rejects unfrozen sources, unauthorized/cap/credential preflight and existing interrupted runs",()=>{
    const source=join(directory,"source.txt"); writeFileSync(source,"changed");
    expect(()=>verifyFreeze({[source]:"wrong"})).toThrow(/freeze mismatch/);
    expect(()=>preflight({})).toThrow(/authorization/);
    const env={BOT_SCENARIO_LIVE:"true",EXTERNAL_INFERENCE_ENABLED:"true",BOT_AUDIT_AUTHORIZATION:"authorize-new-972-decision-audit",BOT_DECISION_CALL_CAP:"1001"};
    expect(()=>preflight(env)).toThrow(/cap/);
    expect(()=>preflight({...env,BOT_DECISION_CALL_CAP:"972"})).toThrow(/credentials/);
    const path=join(directory,"ledger.json"), ledger=new Ledger(path,1,{}), reserved=ledger.reserve({id:"decision-0",provider:"jev",fixture:"HU",representation:"original",repetition:0,inputHash:"hash"});
    expect(JSON.parse(readFileSync(path,"utf8")).slots[0].status).toBe("reserved");
    ledger.request(reserved); expect(()=>ledger.request(reserved)).toThrow(/extra/);
    expect(()=>ledger.reserve({id:"decision-1",provider:"eevo",fixture:"HU",representation:"original",repetition:0,inputHash:"hash"})).toThrow(/exhausted/);
    expect(()=>new Ledger(path,1,{})).toThrow(/replayed/);
    expect(()=>ledger.complete(reserved,row())).toThrow(/match reserved/);
    ledger.complete(reserved,row({fixture:"HU",action:null,failure:"timeout"}));
    expect(JSON.parse(readFileSync(path,"utf8")).slots).toHaveLength(1);
    expect(()=>ledger.complete(reserved,row())).toThrow(/completed/);
  });
  it("uses frozen transports, one guarded request and production deadlines for every provider",async()=>{
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED","true");
    for(const name of ["LLM_API_KEY","TYPESAFE_API_KEY","EEVO_API_KEY"]) vi.stubEnv(name,"test-only-no-network");
    vi.stubEnv("LLM_API_ENDPOINT","https://openrouter.ai/api/v1/chat/completions");
    try {
      for(const provider of ["jev","eevo","llm"] as const) {
        let requests=0;
        const f=fixtures[0], b=materialize(f,"original",8);
        const bot=liveBot(provider,()=>{requests++;},async(url,init)=>{
          expect(init.signal).toBeDefined();
          const body=JSON.parse(String(init.body));
          if(provider==="llm") {
            expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
            expect(body).toMatchObject({model:"openai/gpt-5.4-mini",reasoning:{effort:"low"},provider:{allow_fallbacks:false,require_parameters:true}});
            return new Response(JSON.stringify({model:"openai/gpt-5.4-mini",choices:[{message:{content:JSON.stringify({action:"call",sizing:null})}}]}));
          }
          expect(body.model).toBe(provider==="jev"?"jev-latest":"eevo-1");
          const choices=Object.keys(body.questions.move.criteria);
          return new Response(JSON.stringify({answers:{move:{type:"choice",choice:"call",confidence:1,probabilities:Object.fromEntries(choices.map(c=>[c,c==="call"?1:0]))}}}));
        });
        const result=await observe(bot,f,b,provider,0,"controlled");
        expect(result.failure).toBeNull(); expect(requests).toBe(1);
      }
    } finally {vi.unstubAllEnvs();}
  });
  it("does not accept a returned substitute LLM model",async()=>{
    const f=fixtures[0], b=materialize(f,"original",8);
    const result=await observe({async decide(){return {action:{type:"call",amount:60},diagnostics:emptyDiagnostics(),rawResponse:{model:"different/model"}};}},f,b,"llm",0,"controlled");
    expect(result.action).toBeNull(); expect(result.failure).toBe("invalid_response");expect(result.model).toBe("different/model");
    expect(summarize([], [{provider:"jev",difficulty:"medium",mode:"controlled",fixture:"HU"}]).contrasts.every(c=>c.completePairs===0&&c.excludedPairs===3)).toBe(true);
  });
  it("retains only allowlisted diagnostic metadata",()=>{
    const d=diagnostics({action:{type:"check"},rawResponse:{model:"jev-latest",reasoning:"private",credentials:"secret"},diagnostics:emptyDiagnostics({usage:{prompt_tokens:10,raw:"secret"},probabilities:{check:1,private:1},cost:2})});
    expect(d.usage).toEqual({prompt_tokens:10}); expect(d.model).toBe("jev-latest"); expect(d.probabilities).toEqual({check:1}); expect(JSON.stringify(d)).not.toContain("secret");
    expect(()=>observationSchema.parse({...row(),rawResponse:{}})).toThrow();
    expect(createMoveOptions(fixtures[0].context).length).toBeGreaterThan(0);
  });
});
