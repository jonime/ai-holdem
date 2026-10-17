import { describe, expect, it } from "vitest";
import { OpeningAwareEquityRulesBot } from "@/lib/bots/equity-rules-opening";
import { decisionCandidates } from "@/lib/poker/decision-candidates";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import type { PokerAction } from "@/lib/poker/types";
import type { OpponentRange } from "../range-equity/calculator";
import { contexts, key, replay, type Decision } from "./decision";
import { evaluate, terminalValue, type ResponseModel, type Probabilities } from "./evaluator";

function decision(hero: [string,string] = ["As","Ah"], board: Decision["board"] = ["Ac","7d","4c","2h","9s"], allIn = false, stacks: [number,number] = [120,80]): Decision {
  return { version:"river-decision-v1", dealtPlayers:2, rake:0, sidePots:false, hero, board, stacks, smallBlind:1, bigBlind:2,
    history:[{sequence:1,seat:0,street:"preflop",action:{type:"raise",amount:10}}, {sequence:2,seat:1,street:"preflop",action:{type:"call"}},
      {sequence:3,seat:1,street:"flop",action:{type:"check"}}, {sequence:4,seat:0,street:"flop",action:{type:"bet",amount:10}},
      {sequence:5,seat:1,street:"flop",action:{type:"call"}}, {sequence:6,seat:1,street:"turn",action:{type:"check"}},
      {sequence:7,seat:0,street:"turn",action:{type:"check"}}, {sequence:8,seat:1,street:"river",action:allIn?{type:"bet",amount:stacks[1]-20}:{type:"check"}}] };
}
const bet: PokerAction = { type:"bet",amount:10 }, check: PokerAction = {type:"check"};
const range = (...holdings: [string,string][]): OpponentRange => ({ provenance:"test-v1", combinations:holdings.map(cards=>({cards,weight:1})) });
function model(r: OpponentRange, probabilities: Probabilities | ((i:number)=>Probabilities), actions: PokerAction[] = [bet]): ResponseModel {
  return {version:"test-response-v1",provenance:"hand-calculated", rows:r.combinations.flatMap((c,i)=>actions.map(a=>({holding:c.cards,action:key(a),probabilities:typeof probabilities === "function" ? probabilities(i):probabilities})))};
}
function supported(d: Decision, r: OpponentRange, m: ResponseModel|null, actions: PokerAction[]) {
  const result=evaluate(d,r,m,actions);
  expect(result.status, result.status === "unsupported"?result.reason:"").toBe("supported");
  if(result.status!=="supported")throw new Error(result.reason);
  return result;
}
function ev(d: Decision,r: OpponentRange,m:ResponseModel|null,actions:PokerAction[]) {return supported(d,r,m,actions).actions.map(a=>a.evBB);}
const foldCall: PokerAction[]=[{type:"fold"},{type:"call"}];
describe("restricted river root-action values",()=>{
  it("matches hand-calculated value bets, bluffs, engine payouts and sunk contributions",()=>{
    const d=decision(),r=range(["Ks","Kh"]);
    expect(ev(d,r,model(r,{fold:0,call:1,raise:0}),[check,bet])).toEqual([20,25]);
    const weak=decision(["Js","Th"]), strong=range(["Ks","Kh"]);
    expect(ev(weak,strong,model(strong,{fold:1,call:0,raise:0}),[check,bet])).toEqual([0,20]);
    expect(ev(weak,strong,model(strong,{fold:0,call:1,raise:0}),[check,bet])).toEqual([0,-5]);
  });
  it("uses the 60/160 call threshold, with supplied ranges reversing call and fold",()=>{
    const d=decision(["As","Jh"],["Ac","Kd","Qh","8s","7c"],true);
    const r=range(["Ad","2c"],["Ks","Kh"]);
    expect(ev(d,r,null,foldCall)).toEqual([0,10]); // .5*50 + .5*(-30)
    const heavy={...r,combinations:r.combinations.map((c,i)=>({...c,weight:i===0?1:3}))};
    expect(ev(d,heavy,null,foldCall)).toEqual([0,-10]);
    expect(supported(d,r,null,foldCall).selected.type).toBe("call");
    expect(supported(d,heavy,null,foldCall).selected.type).toBe("fold");
    const threshold={...r,combinations:r.combinations.map((c,i)=>({...c,weight:i===0?3:5}))};
    expect(ev(d,threshold,null,foldCall)[1]).toBeCloseTo(0,10);
  });
  it("returns ties and uncalled chips through the engine at unequal effective stacks",()=>{
    const d=decision(["2c","3d"],["As","Ks","Qs","Js","Ts"]),r=range(["4c","5d"]);
    expect(ev(d,r,model(r,{fold:0,call:1,raise:0},[{type:"bet",amount:100}]),[check,{type:"bet",amount:100}])).toEqual([10,10]);
    const allin={...d,history:d.history.map((h,i)=>i===7?{...h,action:{type:"bet" as const,amount:60}}:h)};
    expect(ev(allin,r,null,foldCall)).toEqual([0,10]);
    const run=replay(d,["4c","5d"]), root=engine.decisionView(run.state).players.find(p=>p.id==="p0")!.stack;
    let end=engine.applyAction(run.state,"p0",{type:"bet",amount:100});
    end=engine.applyAction(end,"p1",{type:"call"});
    expect(terminalValue(end,root,2)).toBe(10);
    expect(engine.replayPots(end).reduce((n,p)=>n+p.awards.reduce((s,a)=>s+a.amount,0),0)).toBe(160);
  });
  it("allows raises to reverse the preferred bluff, losing the new bet when folding",()=>{
    const d=decision(["Js","Th"]),r=range(["Ks","Kh"]);
    const passive=supported(d,r,model(r,{fold:.9,call:.1,raise:0}),[check,bet]);
    const aggressive=supported(d,r,model(r,{fold:.1,call:0,raise:.9}),[check,bet]);
    expect(key(passive.selected)).toBe("bet:10");expect(key(aggressive.selected)).toBe("check");
    const branch=aggressive.actions[1].branches.find(b=>b.response==="raise")!;
    expect(branch.continuation).toBe("fold");expect(branch.continuationValuesBB).toEqual({fold:-5,call:-30});
    expect(aggressive.actions[1].evBB).toBeCloseTo(-2.5);
  });
  it("reweights responses and chooses one continuation against the entire posterior",()=>{
    const d=decision(["As","Jh"],["Ac","Kd","Qh","8s","7c"]),r=range(["Ad","2c"],["Ks","Kh"]);
    const result=supported(d,r,model(r,i=>i===0?{fold:.8,call:0,raise:.2}:{fold:.2,call:0,raise:.8}),[bet]);
    const raise=result.actions[0].branches.find(b=>b.response==="raise")!;
    expect(raise.probability).toBeCloseTo(.5);expect(raise.equity).toBeCloseTo(.2);
    expect(raise.posterior.combinations.map(c=>c.weight).sort()).toEqual([.2,.8]);
    expect(raise.continuation).toBe("fold"); // per-holding clairvoyant continuation would incorrectly call the weak hand
    expect(raise.evBB).toBe(-5);
    expect(result.actions[0].branches.some(b=>b.response==="call")).toBe(false);
  });
  it("removes visible blockers, validates zero-weight duplicates, and never fills empty branches",()=>{
    const d=decision(),r=range(["Ks","Kh"],["As","Kd"]);
    const result=supported(d,r,model(r,{fold:0,call:1,raise:0}),[bet]);
    expect(result.actions[0].branches).toHaveLength(1);expect(result.actions[0].branches[0].posterior.combinations).toHaveLength(1);
    expect(evaluate(d,{...r,combinations:[]},null,[check]).status).toBe("unsupported");
    expect(evaluate(d,{...r,combinations:[r.combinations[1]]},null,[check]).status).toBe("unsupported");
    expect(evaluate(d,{...r,combinations:[r.combinations[0],{...r.combinations[0],weight:0}]},null,[check]).status).toBe("unsupported");
    for(const p of [{fold:-.1,call:1.1,raise:0},{fold:NaN,call:1,raise:0},{fold:0,call:.9,raise:0}]) expect(evaluate(d,r,model(r,p),[bet]).status).toBe("unsupported");
    expect(evaluate(d,r,model(r,{fold:0,call:0,raise:1},[{type:"bet",amount:100}]),[{type:"bet",amount:100}]).status).toBe("unsupported");
  });
  it("rejects unsupported states, incomplete history, missing models, illegal candidates and non-all-in roots",()=>{
    const d=decision(),r=range(["Ks","Kh"]);
    for(const patch of [{rake:1},{dealtPlayers:3},{sidePots:true},{board:d.board.slice(0,4)},{history:d.history.slice(1)}, {history:d.history.slice(0,7)}, {actualOpponent:["Ks","Kh"]}]) {
      expect(evaluate({...d,...patch} as Decision,r,null,[check]).status).toBe("unsupported");
    }
    expect(evaluate(d,r,null,[bet]).status).toBe("unsupported");
    expect(evaluate(d,r,null,[{type:"bet",amount:999}]).status).toBe("unsupported");
    expect(evaluate(d,r,null,[{type:"fold"}]).status).toBe("unsupported");
    const bad={...d,history:d.history.map((h,i)=>i===7?{...h,action:{type:"bet" as const,amount:10}}:h)};
    expect(evaluate(bad,r,null,foldCall).status).toBe("unsupported");
  });
  it("preserves replay, range-order and suit-renaming invariance and deduplicates actual actions",()=>{
    const d=decision(),r=range(["Ks","Kh"],["9c","9d"]),p={fold:.3,call:.4,raise:.3};
    const a=supported(d,r,model(r,p),[check,bet,bet]);
    expect(a.actions).toHaveLength(2);expect(a).toEqual(supported(d,r,model(r,p),[check,bet]));
    const reversed={...r,combinations:[...r.combinations].reverse()};
    expect(a).toEqual(supported(d,reversed,model(reversed,p),[check,bet]));
    const rename=(s:string)=>s[0]+({c:"d",d:"h",h:"s",s:"c"}[s[1]]);
    const renamed={...d,hero:d.hero.map(rename),board:d.board.map(rename)} as Decision;
    const rr={...r,combinations:r.combinations.map(c=>({...c,cards:c.cards.map(rename)}))};
    const b=supported(renamed,rr,model(rr,p),[check,bet]);
    expect(b.actions.map(v=>v.evBB)).toEqual(a.actions.map(v=>v.evBB));expect(b.selected).toEqual(a.selected);
  });
  it("keeps hero production inputs and selected actions invariant to actual opponent cards",async()=>{
    const d=decision(),a=contexts(replay(d,["Ks","Kh"]),"medium").baseline,b=contexts(replay(d,["9c","9d"]),"medium").baseline;
    expect(a.analysis.equitySamples).toBe(5000);expect(a).toEqual(b);
    const bot=new OpeningAwareEquityRulesBot();
    expect((await bot.decide(a)).action).toEqual((await bot.decide(b)).action);
    const r=range(["Ks","Kh"],["9c","9d"]);
    expect(supported(d,r,model(r,{fold:0,call:1,raise:0}),[check,bet]).selected).toEqual(supported(d,r,model(r,{fold:0,call:1,raise:0}),[check,bet]).selected);
  });
  it("leaves exact-river provider candidate safeguards unchanged",()=>{
    const split=decision(["2c","3d"],["As","Ks","Qs","Js","Ts"],true);
    const ctx=contexts(replay(split,["4c","5d"]),"medium").baseline;
    expect(decisionCandidates(ctx).map(a=>a.type)).toEqual(["call"]);
    const lost=decision(["2c","3d"],["Ac","Kd","Qh","Js","Tc"],true);
    // This board forces a split too; the safeguard depends on visible cards, never fixture holdings.
    expect(decisionCandidates(contexts(replay(lost,["4c","5d"]),"medium").baseline).map(a=>a.type)).toEqual(["call"]);
  });
});
