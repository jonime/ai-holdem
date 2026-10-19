import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { OpeningAwareEquityRulesBot, applyConfirmedKingOpening } from "@/lib/bots/equity-rules-opening";
import { emptyDiagnostics, type BotContext, type BotDecision } from "@/lib/bots/types";
import { pokerEngineAdapter as engine, riverShareBounds } from "@/lib/poker/adapter";
import { createLegacySizingOptions } from "@/lib/typesafe/questions";
import { allocation, configuration, difficulties, policies, ranges } from "./config";
import { canonical, context, makeFixtures, materialize, type Fixture } from "./fixtures";
import { override, supportedLine } from "./candidate";
import { conserve, continuation, holdings, scripted, type Block } from "./experiment";
import { analyze, interval } from "./analysis";
import { mechanical } from "./mechanical";
import { parse, save, acquire } from "./storage";
import { hash, verify } from "../preflop-action-value/integrity";
let fixtures: Fixture[];
beforeAll(()=>{ fixtures=makeFixtures(); },15000);
const active = () => fixtures.find(f=>f.spec.orientation===0&&f.spec.replicate===1)!;
async function baseline(f=active()) { const input=context(materialize(f,holdings(f,"broad")[0]),"medium"); return {input,decision:await new OpeningAwareEquityRulesBot().decide(input)}; }
function fakeBet(c: BotContext): BotDecision {return {action:{type:"bet",amount:c.sizingOptions.find(o=>o.choice==="one_half_pot")!.amount!},diagnostics:emptyDiagnostics({matchedRule:"rules-value-bet"}),rawResponse:null};}
describe("river candidate v1 frozen mechanics",()=>{
  it("preallocates independent namespaces, both orientations and global suit-distinct situations",()=>{
    expect(allocation("development")).toHaveLength(48);expect(allocation("confirmation")).toHaveLength(120);
    expect(configuration.namespaces.development).not.toBe(configuration.namespaces.confirmation);
    expect(new Set(fixtures.map(f=>canonical(f.hero,f.board))).size).toBe(168);
    expect(fixtures.map(f=>canonical(f.hero,f.board))).not.toContain(canonical(["9h","8h"],["Jh","Tc","7c","2h","6d"]));
    expect(fixtures.filter(f=>f.spec.phase==="development"&&f.spec.replicate===0)).toHaveLength(12);
    for(const phase of ["development","confirmation"] as const) for(const stratum of new Set(allocation(phase).map(s=>s.stratum))) expect(fixtures.filter(f=>f.spec.phase===phase&&f.spec.stratum===stratum)).toHaveLength(phase==="development"?4:10);
    expect(fixtures).toEqual(makeFixtures());
  },15000);
  it("isolates hidden holdings and uses unchanged default 5000-sample projections",async()=>{
    const f=active(), draws=holdings(f,"value-heavy");
    const a=context(materialize(f,draws[0]),"medium"),b=context(materialize(f,draws.find(h=>h.join()!==draws[0].join())!),"medium");
    expect(a).toEqual(b);expect(a.analysis.equitySamples).toBe(5000);
    expect(holdings(f,"value-heavy")).toEqual(draws);expect(draws).toHaveLength(16);
    for(const difficulty of difficulties){const c={...a,difficulty},d=await new OpeningAwareEquityRulesBot().decide(c);expect(override(c,d).action).toEqual({type:"bet",amount:c.sizingOptions.find(o=>o.choice==="two_thirds_pot")!.amount});}
  },15000);
  it("uses legal rounded sizes and preserves equivalent seat and suit predicates",async()=>{
    const {input,decision}=await baseline();
    expect(override(input,decision).action).toEqual({type:"bet",amount:Math.round(input.hand.pot*2/3)});
    for(const pot of [14,18,22,26,30,34,38]){
      const pre=4,post=pot/2-pre;
      const f={...active(),preRaise:pre,postBet:post,stacks:[pot*1.5,pot*1.5] as [number,number]};
      const c=context(materialize(f,holdings(f,"broad")[0]),"easy"),d=fakeBet(c);
      expect(override(c,d).action).toEqual({type:"bet",amount:Math.round(pot*2/3)});
    }
    for(const orientation of [0,1]){
      const f={...active(),spec:{...active().spec,orientation}},c=context(materialize(f,holdings(f,"broad")[0]),"medium");
      expect(supportedLine(c)).toBe(true);expect(override(c,fakeBet(c)).action).toEqual(override(input,decision).action);
    }
    const rename=(c:string)=>c[0]+"dhsc"["cdhs".indexOf(c[1])];
    const f={...active(),hero:active().hero.map(rename),board:active().board.map(rename)};
    const c=context(materialize(f,holdings(f,"broad")[0]),"medium");
    expect(override(c,fakeBet(c)).action).toEqual(override(input,decision).action);
  },15000);
  it("returns the identical baseline on every excluded category, history, line, stack and action",async()=>{
    const {input:c,decision:d}=await baseline();
    const patches: Partial<BotContext>[]=[
      {hero:{...c.hero,holeCards:["As","Ah"]}}, // not a straight
      {hero:{...c.hero,holeCards:["3c","2c"]}}, // beatable straight on this board
      {hand:{...c.hand,communityCards:["Qc","Qd","8h","7s","6c"]}},
      {hand:{...c.hand,communityCards:["Qc","6c","4c","3d","5s"]}},
      {hand:{...c.hand,communityCards:["As","Kd","Qh","Jc","Ts"]},hero:{...c.hero,holeCards:["3c","2c"]}},
      {hand:{...c.hand,street:"turn"}},
      {situation:{...c.situation!,historyStatus:"unknown"}},
      {situation:{...c.situation!,dealtPlayerCount:3}},
      {situation:{...c.situation!,preflopOrder:[0,1,2]}},
      {opponents:[...c.opponents,{...c.opponents[0],seat:2}]},
      {actionHistory:c.actionHistory.slice(1)},
      {actionHistory:c.actionHistory.map((a,i)=>i===2?{...a,action:"bet"}:a)},
      {hero:{...c.hero,stack:c.hero.stack+20}},
      {analysis:{...c.analysis,effectiveStack:Math.round(c.hand.pot*2/3)}},
      {analysis:{...c.analysis,livePot:c.hand.pot+1}},
      {legalActions:c.legalActions.filter(a=>a.type!=="bet")},
      {legalActions:c.legalActions.map(a=>a.type==="bet"?{...a,maxAmount:Math.round(c.hand.pot/2)}:a)},
      {hero:{...c.hero,investedThisStreet:1}},
    ];
    for(const p of patches) expect(override({...c,...p},d)).toBe(d);
    for(const action of [{type:"check" as const},{type:"bet" as const,amount:1}]){const b={...d,action};expect(override(c,b)).toBe(b);}
    const other={...d,diagnostics:emptyDiagnostics({matchedRule:"other"})};expect(override(c,other)).toBe(other);
    // Collapsed legacy menus cannot invent a missing two-thirds size.
    const tiny={...c,hand:{...c.hand,pot:3},legalActions:[{type:"bet" as const,minAmount:2,maxAmount:2}]};
    expect(createLegacySizingOptions(tiny).some(o=>o.choice==="two_thirds_pot")).toBe(false);expect(override(tiny,d)).toBe(d);
  },15000);
  it("preserves payout accounting, returned chips, ties and conservation",()=>{
    const f={...active(),preRaise:10,postBet:10,stacks:[120,80] as [number,number]},holding=holdings(f,"broad").find(h=>riverShareBounds(h,f.board).maximum<1)!;
    const run=materialize(f,holding),after=engine.applyAction(run.state,run.heroId,{type:"bet",amount:100});
    const end=engine.applyAction(after,engine.snapshot(after).currentActorId!,{type:"call"});conserve(end);
    expect(engine.decisionView(end).players.find(p=>p.id===run.heroId)!.stack).toBe(200);
    const split={...f,hero:["2c","3d"],board:["As","Kd","Qh","Jc","Ts"]};
    const tie=materialize(split,["4c","5d"]),bet=engine.applyAction(tie.state,tie.heroId,{type:"bet",amount:100});
    const terminal=engine.applyAction(bet,engine.snapshot(bet).currentActorId!,{type:"call"});conserve(terminal);
    expect(engine.decisionView(terminal).players.map(p=>p.stack)).toEqual([120,80]);
  },15000);
  it("runs actual production responses after minimum, intermediate and all-in raises",async()=>{
    expect(await mechanical(fixtures)).toEqual({passed:true,checks:24,samples:5000});
    const f=active(),run=materialize(f,holdings(f,"broad")[0]),c=context(run,"hard"),d=await new OpeningAwareEquityRulesBot().decide(c);
    const a=await continuation(run,d.action,"hard","raising","paired");
    expect(a).toEqual(await continuation(run,d.action,"hard","raising","paired"));
    await expect(continuation(run,d.action,"hard","rules","limit",0)).rejects.toThrow("action_limit");
  },45000);
  it("scripted controls preserve forced splits and all guaranteed profitable calls",async()=>{
    const f=fixtures.find(f=>f.spec.replicate===0)!,run=materialize(f,holdings(f,"broad")[0]);
    const after=engine.applyAction(run.state,run.heroId,{type:"bet",amount:Math.round(context(run,"easy").hand.pot*2/3)});
    const actions=[...run.actions,{sequence:run.actions.length+1,action:{type:"bet" as const,amount:Math.round(context(run,"easy").hand.pot*2/3)},stateBefore:run.state}];
    const c=context({...run,state:after,actions},"easy");
    for(const p of ["call-heavy","raising"] as const) expect(scripted(c,p,()=>.999)).toEqual({type:"call"});
    const nuts={...c,hero:{...c.hero,holeCards:["Ac","Kh"]}};
    for(const p of ["call-heavy","raising"] as const) expect(scripted(nuts,p,()=>.999).type).toBe("call");
  },15000);
  it("freezes scripted minimum/intermediate/all-in mass and size-sensitive calls/folds",()=>{
    const f=fixtures.find(f=>f.spec.band===3&&f.spec.replicate===1&&f.spec.orientation===0)!;
    const holding=holdings(f,"broad").find(h=>riverShareBounds(h,f.board).minimum===0)!;
    const run=materialize(f,holding),bet={type:"bet" as const,amount:Math.round(context(run,"easy").hand.pot/2)};
    const after=engine.applyAction(run.state,run.heroId,bet);
    const c=context({...run,state:after,actions:[...run.actions,{sequence:run.actions.length+1,action:bet,stateBefore:run.state}]},"easy");
    const raise=c.legalActions.find(a=>a.type==="raise");if(raise?.type!=="raise")throw new Error("Missing raise");
    for(const [draw,amount] of [[.2,raise.minAmount],[.6,Math.floor((raise.minAmount+raise.maxAmount)/2)],[.9,raise.maxAmount]]){
      const uniforms=[.1,draw];expect(scripted(c,"raising",()=>uniforms.shift()!)).toEqual({type:"raise",amount});
    }
    const call=c.legalActions.find(a=>a.type==="call");if(call?.type!=="call")throw new Error("Missing call");
    for(const policy of ["raising","call-heavy"] as const){
      const probe=(ratio:number)=>({...c,analysis:{...c.analysis,livePot:call.amount/ratio}});
      expect(scripted(probe(.3),policy,()=>.8).type).toBe("call");
      expect(scripted(probe(.9),policy,()=>.8).type).toBe("fold");
    }
  },15000);
  it("retains KK production behavior and keeps the new wrapper outside preflop",()=>{
    const c={game:{bigBlind:2}} as BotContext,d={action:{type:"check"},diagnostics:emptyDiagnostics(),rawResponse:null} as BotDecision;
    expect(applyConfirmedKingOpening(c,d)).toBe(d);
    const pre={hand:{street:"preflop"}} as BotContext;expect(override(pre,d)).toBe(d);
  },15000);
});
function syntheticRows(phase:"development"|"confirmation",value=1): Block[] {
  return fixtures.filter(f=>f.spec.phase===phase).map(f=>({fixture:f,difficulty:"medium",samples:5000,active:f.spec.replicate!==0,root:{type:"check"},candidate:{type:"check"},failure:null,pairs:ranges.flatMap(range=>policies.flatMap(policy=>Array.from({length:16},(_,draw)=>({range,policy,draw,holding:["2c","3d"],baseline:{valueBB:0,trace:[],finalStacks:[]},candidate:{valueBB:f.spec.replicate===0?0:value,trace:[],finalStacks:[]}}))))}));
}
describe("situation inference and immutable recovery",()=>{
  it("clusters holdings at situations and keeps the 27-way correction even for one difficulty",()=>{
    const rows=syntheticRows("confirmation"),a=interval(rows,"broad","rules","confirmation",20000)!;
    expect(a.confidence).toBe(1-.05/27);expect(a.meanBB).toBeCloseTo(.9);expect(a.lower).toBeGreaterThan(0);
    expect(a).toEqual(interval(rows,"broad","rules","confirmation",20000));
    const doubled=rows.map(r=>({...r,pairs:[...r.pairs,...r.pairs]}));expect(interval(doubled,"broad","rules","confirmation",20000)).toEqual(a);
    expect(analyze(rows,"confirmation",true,100)[1].passed).toBe(true);
    rows[0].failure="action_limit";expect(analyze(rows,"confirmation",true,100)[1].passed).toBe(false);
    expect(analyze(syntheticRows("development",-1),"development",true,100)[1].passed).toBe(false);
    expect(analyze(syntheticRows("development"),"development",false,100)[1].passed).toBe(false);
    expect(interval(rows.slice(1),"broad","rules","confirmation",100)).toBeNull();
    const noActivation=syntheticRows("development").map(r=>({...r,active:false}));expect(analyze(noActivation,"development",true,100)[1].passed).toBe(false);
  },15000);
  it("recovers validated checkpoints, rejects drift/corruption and never replaces failures",()=>{
    const f=fixtures[0],row:Block={fixture:f,difficulty:"easy",samples:5000,active:false,root:null,candidate:null,pairs:[],failure:"action_limit"};
    const dir=mkdtempSync(join(tmpdir(),"river-candidate-")),path=join(dir,"block.gz");
    try{
      save(path,"source-a",row);expect(parse(readFileSync(path),"source-a",f,"easy")).toEqual(row);
      expect(()=>parse(readFileSync(path),"source-b",f,"easy")).toThrow();
      expect(()=>parse(readFileSync(path),"source-a",{...f,postBet:f.postBet+1},"easy")).toThrow();
      const bytes=JSON.parse(gunzipSync(readFileSync(path)).toString());bytes.row.failure=null;
      expect(()=>parse(gzipSync(JSON.stringify(bytes)),"source-a",f,"easy")).toThrow();
      expect(()=>save(path,"source-a",{...row,failure:"different_failure"})).toThrow();
      const lock=join(dir,"lock"),release=acquire(lock);expect(()=>acquire(lock,()=>true)).toThrow();release();writeFileSync(lock,JSON.stringify({pid:99999999,token:"dead",host:hostname()}));const recovered=acquire(lock,()=>false);recovered();
      const source=join(dir,"source.ts");writeFileSync(source,"baseline");const files={[source]:hash(readFileSync(source))};verify(files);writeFileSync(source,"changed");expect(()=>verify(files)).toThrow("Source freeze mismatch");
    }finally{rmSync(dir,{recursive:true,force:true});}
  },15000);
  it("validates saved legal terminal traces and deterministic holdings without simulating policies",()=>{
    const f=fixtures[0],row:Block={fixture:f,difficulty:"easy",samples:5000,active:false,root:{type:"check"},candidate:{type:"check"},pairs:[],failure:null};
    for(const range of ranges) for(const [draw,holding] of holdings(f,range).entries()) for(const policy of policies){
      const run=materialize(f,holding),start=engine.decisionView(run.state).players.find(p=>p.id===run.heroId)!.stack,end=engine.applyAction(run.state,run.heroId,{type:"check"});
      const view=engine.decisionView(end),result={valueBB:(view.players.find(p=>p.id===run.heroId)!.stack-start)/2,trace:[{seat:f.spec.orientation,action:{type:"check" as const},rule:null}],finalStacks:view.players.map(p=>p.stack)};
      row.pairs.push({range,policy,draw,holding,baseline:result,candidate:result});
    }
    const dir=mkdtempSync(join(tmpdir(),"river-payout-")),path=join(dir,"block.gz");
    try{
      save(path,"a",row);expect(parse(readFileSync(path),"a",f,"easy")).toEqual(row);
      const changed=JSON.parse(gunzipSync(readFileSync(path)).toString());
      changed.row.pairs[0].baseline.finalStacks[0]++;
      changed.digest=hash(JSON.stringify(changed.row));
      expect(()=>parse(gzipSync(JSON.stringify(changed)),"a",f,"easy")).toThrow("Evidence payout mismatch");
    }finally{rmSync(dir,{recursive:true,force:true});}
  },15000);
});
