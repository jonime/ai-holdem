import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import type { PokerAction } from "@/lib/poker/types";
import { calculateRangeEquity } from "../range-equity/calculator";
import { configuration, continuations, guard, callOdds, ranges, profiles, rangeWeight, type FrozenFixture, type Policy } from "./assumptions";
import { holdingKey, key, replay, responses, terminal } from "./replay";
import { digest } from "./ledger";

export interface Outcome {holding:string;share:number;responses:{response:string;terminalBB:number|null;foldBB:number|null;callBB:number|null;guard:"fold"|"call"|null}[]}
export interface RawAction {fixture:string;root:PokerAction;outcomes:Outcome[];terminals:number;version:"first-to-act-terminal-v1"}
/** Exact engine enumeration, independent of ranges/profiles/continuation choices. */
export function enumerate(f:FrozenFixture,action:PokerAction):RawAction{
  if(!f.candidates.some(a=>key(a)===key(action)))throw new Error("Unlisted root action");
  let terminals=0;
  const outcomes=f.holdings.map(h=>{
    const root=replay(f.spec,h.cards),rootStack=engine.decisionView(root).players.find(p=>p.id==="p1")!.stack;
    const after=engine.applyAction(root,"p1",action),options=responses(after);
    const eq=calculateRangeEquity({hero:f.spec.hero,board:f.spec.board,opponents:[{provenance:"quarter-pot/single-holding-exact",combinations:[{cards:h.cards,weight:1}]}],seed:"unused-exact",sampleBudget:2});
    if(eq.status!=="supported"||eq.method!=="exact-river")throw new Error("Exact river required");
    const result={holding:holdingKey(h.cards),share:eq.showdownShare,responses:options.map(o=>{
      const next=engine.applyAction(after,"p0",o.action),done=engine.decisionView(next).street==="complete";
      const value=(state:Parameters<typeof terminal>[0])=>{terminals++;return terminal(state,rootStack,f.spec.bigBlind);};
      if(done){
        const actual=value(next),view=engine.decisionView(after),hero=view.players.find(p=>p.id==="p1")!,opponent=view.players.find(p=>p.id==="p0")!;
        const call=engine.getLegalActions(after).find(a=>a.type==="call");
        const opponentCommit=opponent.committedHand+(o.action.type==="call"&&call?.type==="call"?call.amount:0);
        const chips=o.action.type==="fold"?hero.stack+view.pot:hero.stack+Math.max(0,hero.committedHand-opponentCommit)+2*Math.min(hero.committedHand,opponentCommit)*eq.showdownShare;
        if(Math.abs(actual-(chips-rootStack)/f.spec.bigBlind)>1e-9)throw new Error("Terminal payout/refund mismatch");
        return {response:key(o.action),terminalBB:actual,foldBB:null,callBB:null,guard:null};
      }
      const view=engine.decisionView(next);
      if(view.currentActorSeat!==1||!["bet","raise"].includes(o.action.type))throw new Error("Unsupported nonterminal response");
      const fold=value(engine.applyAction(next,"p1",{type:"fold"})),call=value(engine.applyAction(next,"p1",{type:"call"}));
      // Heads-up matched contributions make each terminal showdown pot even;
      // engine handles effective-stack unmatched-bet refunds before awards.
      const hero=view.players.find(p=>p.id==="p1")!,opponent=view.players.find(p=>p.id==="p0")!;
      const callAction=engine.getLegalActions(next).find(a=>a.type==="call");
      if(!callAction||callAction.type!=="call")throw new Error("Missing hero call");
      const ownCommit=hero.committedHand+callAction.amount;
      const contestable=2*Math.min(ownCommit,opponent.committedHand);
      const refund=Math.max(0,ownCommit-opponent.committedHand);
      const expected=(hero.stack-callAction.amount+refund+contestable*eq.showdownShare-rootStack)/f.spec.bigBlind;
      if(Math.abs(call-expected)>1e-9)throw new Error("Payout/share/refund arithmetic mismatch");
      return {response:key(o.action),terminalBB:null,foldBB:fold,callBB:call,guard:guard(f.heroBounds,callOdds(next))};
    })};
    return result;
  });
  return {version:"first-to-act-terminal-v1",fixture:f.spec.id,root:action,outcomes,terminals};
}
export interface Branch {response:string;probability:number;posterior:{holding:string;weight:number}[];equity:number|null;foldBB:number|null;callBB:number|null;evBB:number|null;continuation:"fold"|"call"|null;safeguard:"fold"|"call"|null;}
export interface Cell {fixture:string;range:typeof ranges[number];profile:typeof profiles[number];policy:Policy;root:PokerAction;evBB:number;branches:Branch[]}
/** All hero decisions are selected once per observed branch using its entire posterior. */
export function score(f:FrozenFixture,raw:RawAction):Cell[]{
  if(raw.version!=="first-to-act-terminal-v1"||raw.fixture!==f.spec.id||raw.outcomes.length!==f.holdings.length||!f.candidates.some(a=>key(a)===key(raw.root)))throw new Error("Raw action mismatch");
  for(const [i,o] of raw.outcomes.entries()){
    if(o.holding!==holdingKey(f.holdings[i].cards)||![0,.5,1].includes(o.share))throw new Error("Outcome holding/share mismatch");
    const valid=o.responses.every(r=>r.terminalBB!==null?[r.foldBB,r.callBB,r.guard].every(x=>x===null):r.foldBB!==null&&r.callBB!==null);
    if(!valid||o.responses.some(r=>[r.terminalBB,r.foldBB,r.callBB].some(x=>x!==null&&!Number.isFinite(x))))throw new Error("Invalid terminal values");
  }
  return ranges.flatMap(range=>profiles.flatMap(profile=>{
    const table=f.tables.find(t=>t.profile===profile&&t.root===key(raw.root));
    if(!table||table.rows.length!==f.holdings.length)throw new Error("Missing response table");
    const weights=f.holdings.map(h=>rangeWeight(h.category,range)),total=weights.reduce((s,w)=>s+w,0);
    const branches=table.options.map((o,j)=>{
      const mass=table.rows.map((r,i)=>{
        if(r.holding!==raw.outcomes[i].holding||r.probabilities.length!==table.options.length||raw.outcomes[i].responses.length!==table.options.length||raw.outcomes[i].responses[j].response!==key(o.action)||r.probabilities.some(p=>!Number.isFinite(p)||p<0||p>1)||Math.abs(r.probabilities.reduce((s,p)=>s+p,0)-1)>1e-12)throw new Error("Response row mismatch");
        return weights[i]/total*r.probabilities[j];
      });
      const probability=mass.reduce((s,p)=>s+p,0);
      const posterior=mass.flatMap((w,i)=>w>0?[{holding:raw.outcomes[i].holding,weight:w/probability}]:[]);
      const positive=mass.flatMap((w,i)=>w>0?[{weight:w/probability,outcome:raw.outcomes[i],branch:raw.outcomes[i].responses[j]}]:[]);
      if(!probability)return {response:key(o.action),probability:0,posterior:[],equity:null,foldBB:null,callBB:null,terminalBB:null,safeguard:null};
      const first=positive[0].branch;
      if(positive.some(p=>p.branch.guard!==first.guard||(p.branch.terminalBB===null)!==(first.terminalBB===null)))throw new Error("Hidden-card-dependent continuation");
      const sum=(field:"foldBB"|"callBB"|"terminalBB")=>positive.reduce((s,p)=>s+p.weight*p.branch[field]!,0);
      return {response:key(o.action),probability,posterior,equity:o.action.type==="fold"?null:positive.reduce((s,p)=>s+p.weight*p.outcome.share,0),foldBB:first.foldBB===null?null:sum("foldBB"),callBB:first.callBB===null?null:sum("callBB"),terminalBB:first.terminalBB===null?null:sum("terminalBB"),safeguard:first.guard};
    });
    if(Math.abs(branches.reduce((s,b)=>s+b.probability,0)-1)>1e-10)throw new Error("Branch mass not one");
    return continuations.map(policy=>{
      const resolved:Branch[]=branches.map(b=>{
        const continuation=b.callBB===null?null:policy==="posterior-best"?(b.callBB>=b.foldBB!?"call":"fold"):b.safeguard??policy;
        const evBB=b.probability===0?null:continuation===null?b.terminalBB:continuation==="call"?b.callBB:b.foldBB;
        return {response:b.response,probability:b.probability,posterior:b.posterior,equity:b.equity,foldBB:b.foldBB,callBB:b.callBB,evBB,continuation,safeguard:b.safeguard};
      });
      return {fixture:f.spec.id,range,profile,policy,root:raw.root,evBB:resolved.reduce((s,b)=>s+b.probability*(b.evBB??0),0),branches:resolved};
    });
  }));
}
export function verifyScored(f:FrozenFixture,raw:RawAction,cells:Cell[]){
  if(digest(score(f,raw))!==digest(cells))throw new Error("Saved scores do not reproduce from terminal evidence");
}
export const tolerance=configuration.toleranceBB;
