import { calculateShowdownEquity } from "@/lib/poker/equity";
import { EquityRulesV2Bot } from "@/lib/bots/equity-rules-v2";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { analyzePreflopFeatures } from "@/lib/bots/equity-rules/hand-analysis";
import type { BotContext, PokerBot } from "@/lib/bots/types";
import { EquityRulesStrategy, rulesProfiles } from "./rules-strategy";
import { canonicalSeed, frequency, suitPermutations } from "./canonical";
import { representationCases, representations, materialize, handClasses, preflopNodes } from "../bot-audit/fixtures";
import { buildPreflopNode, evaluationContext } from "../poker-context-harness";
import { playHand, bootstrapInterval, type Opponent } from "../equity-rules/experiment";
import type { AIDifficulty } from "@/lib/poker/types";
export const candidate: PokerBot = { async decide(context) { return new EquityRulesStrategy().decide(context); } };
export async function traces(samples=5000) {
  const baseline = new EquityRulesV2Bot(), rows=[];
  for (const node of preflopNodes) for (const hand of handClasses.filter(h=>["AA","KK","QQ","AKs","AKo"].includes(h.notation))) {
    const f=buildPreflopNode(node,hand.cards,"facts",samples), original=evaluationContext(f.state,f.history,"facts",samples,true);
    const independentEquity = node.id === "six-open-UTG" ? calculateShowdownEquity({heroHoleCards:hand.cards,communityCards:[],opponentCount:5,sampleCount:samples === 5000 ? 20000 : samples,seed:`independent-premium-${hand.notation}-v1`}) : null;
    for (const difficulty of ["easy","medium","hard"] as const) {
      const context={...original,difficulty}, decision=await baseline.decide(context);
      const call=context.legalActions.find(a=>a.type==="call");
      const pressure=context.opponents.reduce((s,p)=>s+context.actionHistory.filter(a=>a.actorSeat===p.seat&&["bet","raise","all_in"].includes(a.action)).length*.04,0);
      rows.push({node:node.id,hand:hand.notation,difficulty,features:analyzePreflopFeatures(hand.cards),
        equity:context.analysis.showdownEquity,equitySamples:samples,independentEquity,independentSamples:independentEquity===null?null:samples===5000?20000:samples,activeOpponents:context.opponents.filter(p=>p.status!=="folded").length,
        pot:context.hand.pot,livePot:context.analysis.livePot,contestablePotAfterCall:context.analysis.contestablePotAfterCall,
        callCost:call?.amount??0,potOdds:call ? call.amount/context.analysis.contestablePotAfterCall : 0,
        callRequired:(call ? call.amount/context.analysis.contestablePotAfterCall : 0)+rulesProfiles[difficulty].callThreshold+pressure*.05,
        valueThreshold:rulesProfiles[difficulty].valueThreshold+pressure*rulesProfiles[difficulty].pressureBias,
        action:decision.action,branch:decision.diagnostics.matchedRule,
        opponentsMatchSituation:context.situation?.activeOpponentCount===context.opponents.filter(p=>p.status!=="folded").length});
    }
  }
  return rows;
}
export async function invariants(samples=5000) {
  const fixtures=representationCases(samples), baseline=new EquityRulesV2Bot(), rows=[];
  for(const f of fixtures) for(const difficulty of ["easy","medium","hard"] as const) {
    const original=materialize(f,"original",samples,true).controlled;
    const reference=await candidate.decide({...original,difficulty});
    for(const representation of representations) {
      const b=materialize(f,representation,samples,true), c={...b.controlled,difficulty};
      const before=await baseline.decide(c), after=await candidate.decide(c);
      engine.applyAction(b.state,engine.snapshot(b.state).currentActorId!,after.action);
      const action=(a:typeof after.action,ctx:BotContext)=>JSON.stringify({type:a.type,amount:"amount" in a ? (a.amount??0)/ctx.game.bigBlind : null});
      rows.push({fixture:f.id,difficulty,representation,baseline:action(before.action,c),candidate:action(after.action,c),
        canonicalMatches:action(after.action,c)===action(reference.action,original),frequency:frequency(canonicalSeed(c))});
    }
  }
  return rows;
}
export async function compare(opponent: Opponent,difficulty:AIDifficulty,seats:2|6,blocks=500,samples=100,handRunner:typeof playHand=playHand) {
  const baseline=new EquityRulesV2Bot(), profits: {seed:number;rotation:number;arm:string;profitBB:number|null;failure:string|null}[]=[], differences:number[]=[], excluded:number[]=[];
  const counters: Record<string,{actions:Record<string,number>;stages:Record<string,number>;sizings:Record<string,number>;decisions:number}> = {};
  for(let seed=1;seed<=blocks;seed++) {
    const block: typeof profits=[];
    const blockCounters: typeof counters={};
    for(let rotation=0;rotation<seats;rotation++) for(const arm of ["baseline","canonical"] as const) {
      try {
        const result=await handRunner("frozen",opponent,difficulty,seats,rotation,seed,samples,arm==="baseline"?baseline:candidate);
        block.push({seed,rotation,arm,profitBB:result.profitBB,failure:null});
        const counts=blockCounters[arm]??={actions:{},stages:{},sizings:{},decisions:0}; counts.decisions+=result.decisions;
        for(const field of ["actions","stages","sizings"] as const) for(const [key,n] of Object.entries(result[field])) counts[field][key]=(counts[field][key]??0)+n;
      } catch { block.push({seed,rotation,arm,profitBB:null,failure:"hand_failed"}); }
    }
    profits.push(...block);
    if(block.some(p=>p.failure)) { excluded.push(seed);continue; }
    const mean=(arm:string)=>block.filter(p=>p.arm===arm).reduce((s,p)=>s+p.profitBB!,0)/seats;
    differences.push(mean("canonical")-mean("baseline"));
    for(const [arm,c] of Object.entries(blockCounters)) {
      const total=counters[arm]??={actions:{},stages:{},sizings:{},decisions:0}; total.decisions+=c.decisions;
      for(const field of ["actions","stages","sizings"] as const) for(const [key,n] of Object.entries(c[field])) total[field][key]=(total[field][key]??0)+n;
    }
  }
  return {opponent,difficulty,seats,blocks,equitySamples:samples,completeBlocks:differences.length,excluded,
    paired:bootstrapInterval(differences),counters,profits};
}

/** Enumerate all global suit permutations, 16 hand numbers and all audit transforms. */
export async function seedSweep(samples=5000) {
  const f=representationCases(samples).find(f=>f.id==="4-turn-draw")!;
  const baseline=new EquityRulesV2Bot(), rows=[];
  for(const representation of representations) {
    const b=materialize(f,representation,samples,true);
    for(const suits of suitPermutations) {
      const card=(s:string)=>s[0]+suits["cdhs".indexOf(s[1])];
      const hole=b.controlled.hero.holeCards.map(card),board=b.controlled.hand.communityCards.map(card);
      const base={...b.controlled,hero:{...b.controlled.hero,holeCards:hole,handStrength:{...b.controlled.hero.handStrength,bestFive:b.controlled.hero.handStrength.bestFive.map(card)}},hand:{...b.controlled.hand,communityCards:board}};
      for(let handNumber=1;handNumber<=16;handNumber++) for(const difficulty of ["medium","hard"] as const) {
        const context={...base,difficulty,game:{...base.game,handNumber}};
        const before=await baseline.decide(context),after=await candidate.decide(context);
        const action=(a:typeof after.action)=>({type:a.type,amountBB:"amount" in a?(a.amount??0)/context.game.bigBlind:null});
        rows.push({representation,suits,handNumber,difficulty,frequency:frequency(canonicalSeed(context)),baseline:action(before.action),candidate:action(after.action)});
      }
    }
  }
  for(const handNumber of Array.from({length:16},(_,i)=>i+1)) for(const difficulty of ["medium","hard"]) {
    const selected=rows.filter(r=>r.handNumber===handNumber&&r.difficulty===difficulty);
    if(new Set(selected.map(r=>JSON.stringify(r.candidate))).size!==1) throw new Error("Canonical suit/scale/seed sweep failed");
  }
  return rows;
}
