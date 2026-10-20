import { evaluateVisibleCards, riverShareBounds, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import type { PokerAction, PokerGameState } from "@/lib/poker/types";
import { deck } from "../range-equity/calculator";
import { key, replay, responses, type Spec } from "./replay";

export const version="llm-quarter-pot-v1";
export const ranges=["broad","value-heavy","polarized"] as const;
export const profiles=["call-heavy","selective-value","bluff-pressure"] as const;
export const continuations=["fold","call","posterior-best"] as const;
export type Policy=typeof continuations[number];
export type Profile=typeof profiles[number];
export const categories=["high-card","one-pair","two-pair","three-of-a-kind","straight","flush","full-house","four-of-a-kind","straight-flush"];
// Fixed before action values are scored. Rows: high card / pair or two pair / trips+.
export const configuration={version,toleranceBB:1e-9,rangeWeights:{broad:"1","value-heavy":"2^categoryIndex",polarized:"categoryIndex>=4 ? 12 : categoryIndex===0 ? 6 : 1"},
  profiles:{
    "call-heavy":{check:[.80,.65,.35],bets:[.60,.30,.10],facing:[[.15,.80,.05],[.05,.85,.10],[0,.75,.25]],raises:[.60,.30,.10]},
    "selective-value":{check:[.95,.70,.15],bets:[.25,.50,.25],facing:[[.85,.14,.01],[.30,.65,.05],[.02,.43,.55]],raises:[.25,.50,.25]},
    "bluff-pressure":{check:[.35,.65,.20],bets:[.25,.35,.40],facing:[[.45,.25,.30],[.25,.50,.25],[.05,.40,.55]],raises:[.25,.35,.40]},
  },pressure:"If hero bet > half root pot, weak/middle call mass *= .6; removed mass folds. Strong unchanged.",
  sizeResolution:"Round to nearest chip, clamp to engine min/max. Pot raise-to = own street commitment + call + live pot + call. Merge alias masses after resolving actual amounts. No raise availability transfers raise mass to call before safeguards.",
  safeguards:"Exact all-unseen-card share bounds, using acting player's cards + public board only. Forced split check/call. Guaranteed nonnegative call (min share >= contestable odds) overrides fold. Impossible call (max share=0) overrides call to fold. Hero fold/call policies use same guards. Posterior-best compares engine terminal posterior means, ties call.",
  provenance:"Original synthetic sensitivity assumptions, frozen expanded before scoring. No calibration, session-stat inference, sampling, or tuning to outcomes.",
  continuation:"Hero may only fold/call after opponent aggression; no hero re-raises. posterior-best is an optimistic range-informed reference, not observed LLM behavior.",
} as const;
export function rangeWeight(category:number,name:typeof ranges[number]){return name==="broad"?1:name==="value-heavy"?2**category:category>=4?12:category===0?6:1;}
export function callOdds(state:PokerGameState){
  const v=engine.decisionView(state),own=v.players.find(p=>p.seat===v.currentActorSeat)!,other=v.players.find(p=>p.seat!==v.currentActorSeat)!;
  const call=engine.getLegalActions(state).find(a=>a.type==="call");
  if(!call||call.type!=="call")throw new Error("No call at safeguard node");
  const refund=Math.max(0,other.committedHand-(own.committedHand+call.amount));
  const contestable=v.pot+call.amount-refund;
  if(contestable<=0)throw new Error("Invalid contestable pot");
  return call.amount/contestable;
}
export function guard(bounds:{minimum:number;maximum:number},odds:number):"fold"|"call"|null{
  if(bounds.minimum===.5&&bounds.maximum===.5)return "call";
  if(bounds.minimum>=odds)return "call";
  if(bounds.maximum===0)return "fold";
  return null;
}
export interface Holding {cards:string[];category:number;bounds:{minimum:number;maximum:number}}
export interface Table {profile:Profile;root:string;options:ReturnType<typeof responses>;rows:{holding:string;probabilities:number[];safeguard:string|null}[]}
export interface FrozenFixture {spec:Spec;candidates:PokerAction[];holdings:Holding[];heroBounds:{minimum:number;maximum:number};tables:Table[]}
/** Behavior knows only own cards/category/bounds and public betting state. */
export function behavior(profile:Profile,category:number,bounds:Holding["bounds"],state:PokerGameState,rootPot:number,root:PokerAction,options:ReturnType<typeof responses>){
  if(!profiles.includes(profile)||category<0||category>8)throw new Error("Invalid profile/category");
  const p=configuration.profiles[profile],tier=category===0?0:category<=2?1:2;
  const masses:Record<string,number>={};let safeguard:string|null=null;
  if(root.type==="check"){
    if(bounds.minimum===.5&&bounds.maximum===.5){masses["check-back"]=1;safeguard="forced-split";}
    else{masses["check-back"]=p.check[tier];for(const [i,label] of ["half-pot","full-pot","all-in"].entries())masses[label]=(1-p.check[tier])*p.bets[i];}
  }else{
    let [fold,call,raise]:number[]=[...p.facing[tier]];
    if(root.type!=="bet")throw new Error("Unsupported root");
    if(root.amount>rootPot/2&&tier<2){fold+=call*.4;call*=.6;}
    if(!options.some(o=>o.action.type==="raise")){call+=raise;raise=0;}
    const forced=guard(bounds,callOdds(state));
    if(forced){fold=forced==="fold"?1:0;call=forced==="call"?1:0;raise=0;safeguard=forced;}
    masses.fold=fold;masses.call=call;
    for(const [i,label] of ["minimum-raise","pot-raise","all-in"].entries())masses[label]=raise*p.raises[i];
  }
  const probabilities=options.map(o=>o.labels.reduce((s,l)=>s+(masses[l]??0),0));
  if(probabilities.some(p=>!Number.isFinite(p)||p<0)||Math.abs(probabilities.reduce((s,p)=>s+p,0)-1)>1e-12)throw new Error("Invalid response mass");
  return {probabilities,safeguard};
}
export function expand(spec:Spec,candidates:PokerAction[]):FrozenFixture{
  if(!candidates.length||new Set(candidates.map(key)).size!==candidates.length||!candidates.some(a=>a.type==="check")||candidates.some(a=>!["check","bet"].includes(a.type)))throw new Error("Invalid candidate union");
  const available=deck.filter(c=>![...spec.hero,...spec.board].includes(c));
  const holdings:Holding[]=available.flatMap((a,i)=>available.slice(i+1).map(b=>{
    const cards=[a,b],category=categories.indexOf(evaluateVisibleCards(cards,spec.board).category??"");
    if(category<0)throw new Error("Unknown category");
    return {cards,category,bounds:riverShareBounds(cards,spec.board)};
  }));
  if(holdings.length!==990)throw new Error("Expected all 990 holdings");
  const root=replay(spec,holdings[0].cards),pot=engine.decisionView(root).pot;
  const tables=profiles.flatMap(profile=>candidates.map(action=>{
    const after=engine.applyAction(root,"p1",action),options=responses(after);
    return {profile,root:key(action),options,rows:holdings.map(h=>({holding:h.cards.slice().sort().join(","),...behavior(profile,h.category,h.bounds,after,pot,action,options)}))};
  }));
  return {spec,candidates,holdings,heroBounds:riverShareBounds(spec.hero,spec.board),tables};
}
