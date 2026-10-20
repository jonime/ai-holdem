import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { pokerEngineAdapter as engine,riverShareBounds,evaluateVisibleCards } from "@/lib/poker/adapter";
import { extract } from "./ledger";
import { replay,responses,key,holdingKey,terminal,type Spec } from "./replay";
import { behavior,profiles,categories,guard,callOdds,type FrozenFixture } from "./assumptions";
import { enumerate,score } from "./evaluator";
import { analyze } from "./analysis";

const spec:Spec={version:"first-to-act-river-v1",id:"2-river-0",hero:["As","Ah"],board:["9s","8s","2c","3d","Qh"],stacks:[40,40],smallBlind:1,bigBlind:2,buttonSeat:0,heroSeat:1,history:[
  {sequence:1,seat:0,street:"preflop",action:{type:"raise",amount:6}},{sequence:2,seat:1,street:"preflop",action:{type:"call"}},
  {sequence:3,seat:1,street:"flop",action:{type:"check"}},{sequence:4,seat:0,street:"flop",action:{type:"check"}},
  {sequence:5,seat:1,street:"turn",action:{type:"check"}},{sequence:6,seat:0,street:"turn",action:{type:"check"}},
]};
function fixture(s=spec,cards=[["Kc","Kd"],["Qs","Qd"]]):FrozenFixture{
 const holdings=cards.map(cards=>({cards,category:categories.indexOf(evaluateVisibleCards(cards,s.board).category!),bounds:riverShareBounds(cards,s.board)}));
 const root=replay(s,cards[0]),candidates=[{type:"check"},{type:"bet",amount:3},{type:"bet",amount:4}] as const;
 return {spec:s,candidates:[...candidates],holdings,heroBounds:riverShareBounds(s.hero,s.board),tables:profiles.flatMap(profile=>candidates.map(action=>{
 const after=engine.applyAction(root,"p1",action),options=responses(after);
 return {profile,root:key(action),options,rows:holdings.map(h=>({holding:holdingKey(h.cards),...behavior(profile,h.category,h.bounds,after,12,action,options)}))};
 }))};
}
function selected(f:FrozenFixture,action:{type:"check"}|{type:"bet";amount:number},policy="fold"){
 return score(f,enumerate(f,action)).find(c=>c.range==="broad"&&c.profile==="call-heavy"&&c.policy===policy)!;
}
function setProbabilities(f:FrozenFixture,root:string,prob:(option:ReturnType<typeof responses>[number],index:number)=>number){
 for(const t of f.tables.filter(t=>t.root===root))for(const [i,r] of t.rows.entries())r.probabilities=t.options.map(o=>prob(o,i));
}
describe("first-to-act river v1",()=>{
 it("replays seat 1 first and rejects last-to-act, missing history and blocked cards",()=>{
  const root=replay(spec,["Kc","Kd"]),v=engine.decisionView(root);
  expect([v.currentActorSeat,v.pot,...v.players.map(p=>p.stack)]).toEqual([1,12,34,34]);
  expect(()=>replay({...spec,history:spec.history.slice(1)},["Kc","Kd"])).toThrow();
  expect(()=>replay(spec,["As","Kd"])).toThrow();
  expect(()=>replay({...spec,history:[...spec.history,{sequence:7,seat:1,street:"river",action:{type:"check"}}] as unknown as Spec["history"]},["Kc","Kd"])).toThrow();
  expect(engine.decisionView(engine.applyAction(root,"p1",{type:"check"})).street).toBe("river");
 });
 it("terminates check-bet-fold/call, non-all-in raises and all-in refunds exactly",()=>{
  const f=fixture(),checked=enumerate(f,{type:"check"}),bet=enumerate(f,{type:"bet",amount:4});
  const win=checked.outcomes[0].responses.find(r=>r.response==="bet:6")!;
  expect(win.foldBB).toBe(0);expect(win.callBB).toBe(9);
  const lose=checked.outcomes[1].responses.find(r=>r.response==="bet:6")!;
  expect(lose.callBB).toBe(-3);
  const raised=bet.outcomes[0].responses.find(r=>r.response==="raise:8")!;
  expect(raised.foldBB).toBe(-2);expect(raised.callBB).toBe(10);
  const unequal=fixture({...spec,stacks:[100,40]}),allin=enumerate(unequal,{type:"check"}).outcomes[0].responses.find(r=>r.response==="bet:94")!;
  expect(allin.callBB).toBe(23); // Only hero's 34 remaining chips can be matched.
  expect(allin.foldBB).toBe(0);
 });
 it("verifies forced splits, guaranteed calls, impossible calls and conservation",()=>{
  expect(guard({minimum:1,maximum:1},.49)).toBe("call");expect(guard({minimum:0,maximum:0},.1)).toBe("fold");
  const f=fixture({...spec,hero:["4h","5h"],board:["As","Ks","Qs","Js","Ts"]},[["2h","3h"]]);
  const c=selected(f,{type:"bet",amount:4});
  expect(c.branches.find(b=>b.response==="call")!.probability).toBe(1);
  expect(c.evBB).toBe(3);
  const raw=enumerate(f,{type:"check"});
  expect(raw.outcomes[0].responses.filter(r=>r.callBB!==null).every(r=>r.guard==="call"&&r.callBB===3)).toBe(true);
  const root=replay(spec,["Kc","Kd"]);expect(()=>terminal(root,34,2)).toThrow();
 });
 it("merges clamped and duplicate sizes and checks effective pot odds",()=>{
  const root=replay({...spec,stacks:[8,40]},["Kc","Kd"]),after=engine.applyAction(root,"p1",{type:"check"});
  const options=responses(after);expect(options.filter(o=>o.action.type==="bet")).toHaveLength(1);
  expect(options.find(o=>o.action.type==="bet")!.labels).toEqual(["half-pot","full-pot","all-in"]);
  const facing=engine.applyAction(after,"p0",{type:"bet",amount:2});expect(callOdds(facing)).toBe(2/16);
 });
 it("reweights after responses and selects against entire posterior, never the hidden holding",()=>{
  const f=fixture();
  setProbabilities(f,"check",(o,i)=>o.action.type==="bet"&&o.action.amount===6?(i===0?.8:.2):o.action.type==="check"?(i===0?.2:.8):0);
  const c=selected(f,{type:"check"},"posterior-best"),b=c.branches.find(b=>b.response==="bet:6")!;
  expect(b.probability).toBeCloseTo(.5);expect(b.equity).toBeCloseTo(.8);expect(b.callBB).toBeCloseTo(6.6);expect(b.continuation).toBe("call");
  expect(b.posterior.map(p=>p.weight)).toEqual([.8,.2]);
  // Calling the losing actual holding remains part of the selected whole-range call.
  expect(enumerate(f,{type:"check"}).outcomes[1].responses.find(r=>r.response==="bet:6")!.callBB).toBe(-3);
 });
 it("reports zero branches without inventing posteriors and rejects invalid probabilities",()=>{
  const f=fixture();setProbabilities(f,"check",o=>o.action.type==="check"?1:0);
  expect(selected(f,{type:"check"}).branches.filter(b=>b.probability===0).every(b=>b.equity===null&&b.evBB===null&&b.posterior.length===0)).toBe(true);
  f.tables[0].rows[0].probabilities[0]=2;
  expect(()=>selected(f,{type:"check"})).toThrow();
 });
 it("shows treating check as showdown can reverse the action ranking",()=>{
  const f=fixture(spec,[["Kc","Kd"]]);
  setProbabilities(f,"check",o=>o.action.type==="bet"&&o.action.amount===6?1:0);
  setProbabilities(f,"bet:4",o=>o.action.type==="fold"||o.action.type==="raise"&&o.action.amount===8?.5:0);
  const check=selected(f,{type:"check"}),bet=selected(f,{type:"bet",amount:4});
  expect(check.evBB).toBe(0);expect(bet.evBB).toBe(2);
  const root=replay(spec,["Kc","Kd"]),showdown=engine.applyAction(engine.applyAction(root,"p1",{type:"check"}),"p0",{type:"check"});
  expect(terminal(showdown,34,2)).toBe(6); // Incorrect forced check-back ranks check above bet.
 });
 it("keeps opponent behavior invariant to hero's actual hidden cards",()=>{
  const one=fixture(),other=fixture({...spec,hero:["4h","5h"]});
  expect(one.tables).toEqual(other.tables);
 });
 it("rejects illegal roots and duplicate/clamped root substitutions",()=>{
  const f=fixture();expect(()=>enumerate(f,{type:"bet",amount:999})).toThrow();
  f.candidates.push({type:"bet",amount:999});expect(()=>enumerate(f,{type:"bet",amount:999})).toThrow();
 });
});
const plan=JSON.parse(readFileSync("benchmarks/bet-sizing/plan.json","utf8")),freeze=JSON.parse(readFileSync("benchmarks/bet-sizing/freeze.json","utf8"));
const original=()=>JSON.parse(gunzipSync(readFileSync("benchmarks/bet-sizing/live-evidence-2026-10-16.json.gz")).toString());
describe("original ledger integrity",()=>{
 it("extracts every recorded action and checks both cells",()=>{const rows=extract(original(),plan,freeze);expect(rows).toHaveLength(40);expect(rows.filter(r=>r.action?.type==="check")).toHaveLength(16);});
 it.each(["missing","duplicate","failed","identity","input","requests","manifest"])("rejects %s evidence",kind=>{
  const l=original();
  if(kind==="missing")l.slots.pop();if(kind==="duplicate")l.slots[1]=l.slots[0];if(kind==="failed")l.slots[0].row.failure="bad";
  if(kind==="identity")l.slots[0].row.fixture="wrong";if(kind==="input")l.slots[0].entry.inputHash="0".repeat(64);if(kind==="requests")l.slots[0].requests=0;if(kind==="manifest")l.manifest.cap=999;
  expect(()=>extract(l,plan,freeze)).toThrow();
 });
 it("requires all 27 cells, keeps unchanged/check actions and gates fixtures separately",()=>{
  const rows=extract(original(),plan,freeze),f=fixture(),raws=f.candidates.flatMap(a=>score(f,enumerate(f,a)));
  const cells=[...raws,...raws.map(c=>({...c,fixture:"2-river-1"}))],a=analyze(cells,rows);
  for(const r of a.fixtures)for(const c of r.combinations)expect(c.recordedMenuDifferenceBB).toBeCloseTo(.3*c.sizeDifferenceBB,12);
  expect(a.fixtures.every(f=>f.combinations.length===27)).toBe(true);
  expect(()=>analyze(cells.slice(1),rows)).toThrow();
 });
});
describe("conservative screening gate",()=>{
 it("cannot rescue a failed fixture with a positive two-fixture mean; honors 1e-9 BB",()=>{
  const observations=extract(original(),plan,freeze);
  const base=fixture(),cells=base.candidates.flatMap(a=>score(base,enumerate(base,a)));
  function synthetic(first:number,second:number){
    return [first,second].flatMap((delta,i)=>cells.map(c=>({...c,fixture:`2-river-${i}`,evBB:key(c.root)==="bet:3"?delta:0})));
  }
  expect(analyze(synthetic(1,1),observations).verdict).toBe("shortlist-for-later-paid-study-plan");
  expect(analyze(synthetic(10,-1),observations).verdict).toBe("defer");
  expect(analyze(synthetic(0,0),observations).verdict).toBe("defer");
  expect(analyze(synthetic(1e-10,1),observations).verdict).toBe("defer"); // no strictly positive menu difference in first fixture
  const reversed=synthetic(1,1);reversed[0].evBB=0; // replace one bet:3 cell explicitly
  reversed.find(c=>c.fixture==="2-river-0"&&key(c.root)==="bet:3")!.evBB=-1;
  const result=analyze(reversed,observations);expect(result.verdict).toBe("defer");expect(result.fixtures[0].sizeSignReverses).toBe(true);
 });
});
