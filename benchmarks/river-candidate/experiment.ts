import { evaluateVisibleCards, pokerEngineAdapter as engine, riverShareBounds } from "@/lib/poker/adapter";
import { OpeningAwareEquityRulesBot } from "@/lib/bots/equity-rules-opening";
import type { BotContext } from "@/lib/bots/types";
import type { AIDifficulty, PokerAction, PokerGameState } from "@/lib/poker/types";
import { deck } from "../range-equity/calculator";
import { policies, ranges } from "./config";
import { context, materialize, rng, type Fixture, type Run } from "./fixtures";
import { override } from "./candidate";
const categories = ["high-card","one-pair","two-pair","three-of-a-kind","straight","flush","full-house","four-of-a-kind","straight-flush"];
export function category(hole: readonly string[], board: readonly string[]) { return categories.indexOf(evaluateVisibleCards(hole,board).category ?? ""); }
export function holdings(f: Fixture, range: typeof ranges[number]) {
  const available = deck.filter(c => ![...f.hero,...f.board].includes(c));
  const all = available.flatMap((a,i) => available.slice(i+1).map(b => {
    const cards = [a,b], strength = category(cards,f.board);
    return { cards, weight: range === "broad" ? 1 : range === "value-heavy" ? 2 ** strength : strength >= 4 ? 12 : strength === 0 ? 6 : 1 };
  }));
  const total = all.reduce((s,c) => s+c.weight,0), random = rng(`${f.spec.id}/${range}/holdings-v1`);
  return Array.from({length:16}, () => {
    let target = random()*total;
    for (const holding of all) { target -= holding.weight; if (target < 0) return holding.cards; }
    throw new Error("Sampling mass lost");
  });
}
export function scripted(c: BotContext, policy: "call-heavy" | "raising", random: () => number): PokerAction {
  const call = c.legalActions.find(a => a.type === "call");
  if (!call || call.type !== "call") {
    if (c.legalActions.some(a => a.type === "check")) return {type:"check"};
    throw new Error("Unsupported scripted node");
  }
  const bounds = riverShareBounds(c.hero.holeCards,c.hand.communityCards);
  if (bounds.minimum === .5 && bounds.maximum === .5) return {type:"call"};
  const guaranteed = bounds.minimum >= call.amount / c.analysis.contestablePotAfterCall;
  const pressure = call.amount / (c.analysis.livePot ?? c.hand.pot);
  const raise = c.legalActions.find(a => a.type === "raise");
  if (policy === "raising" && raise?.type === "raise" && random() < (category(c.hero.holeCards,c.hand.communityCards)>=2?.45:.20)) {
    const draw = random();
    return {type:"raise",amount:draw < .40 ? raise.minAmount : draw < .75 ? Math.floor((raise.minAmount+raise.maxAmount)/2) : raise.maxAmount};
  }
  const chance = policy === "call-heavy" ? pressure<=.4?.95:pressure<=.7?.80:.55 : pressure<=.4?.85:pressure<=.7?.55:.20;
  return guaranteed || random()<chance ? {type:"call"} : {type:"fold"};
}
export function conserve(state: PokerGameState) {
  const view = engine.decisionView(state);
  if (view.players.reduce((s,p) => s+p.stack,0) + (view.street === "complete" ? 0 : view.pot) !== state.config.players.reduce((s,p) => s+p.stack,0)) throw new Error("Chip conservation failed");
}
export interface Rollout { valueBB: number; trace: { seat: number; action: PokerAction; rule: string | null }[]; finalStacks: number[] }
export async function continuation(original: Run, root: PokerAction, difficulty: AIDifficulty, policy: typeof policies[number], randomSeed: string, limit = 100): Promise<Rollout> {
  const run = {...original, actions:[...original.actions]}, bot = new OpeningAwareEquityRulesBot(), random = rng(randomSeed);
  const start = engine.decisionView(run.state).players.find(p=>p.id===run.heroId)!.stack;
  const trace: Rollout["trace"] = [];
  for (let n=0; ; n++) {
    conserve(run.state);
    const view = engine.decisionView(run.state);
    if (view.street === "complete") return { valueBB:(view.players.find(p=>p.id===run.heroId)!.stack-start)/run.state.config.bigBlind, trace, finalStacks:view.players.map(p=>p.stack) };
    if (n>=limit) throw new Error("action_limit");
    const actor = engine.snapshot(run.state).currentActorId!;
    let action: PokerAction, rule: string | null = null;
    if (n===0) action=root;
    else {
      const input = context(run,difficulty,actor);
      if (actor===run.heroId || policy==="rules") { const d=await bot.decide(input); action=d.action; rule=d.diagnostics.matchedRule; }
      else action=scripted(input,policy,random);
    }
    trace.push({seat:view.currentActorSeat!,action,rule});
    run.actions.push({sequence:run.actions.length+1,action,stateBefore:run.state});
    run.state=engine.applyAction(run.state,actor,action);
  }
}
export interface Pair { range: typeof ranges[number]; policy: typeof policies[number]; draw: number; holding: string[]; baseline: Rollout; candidate: Rollout }
export interface Block { fixture: Fixture; difficulty: AIDifficulty; samples: 5000; active: boolean; root: PokerAction | null; candidate: PokerAction | null; pairs: Pair[]; failure: string | null }
export async function evaluate(fixture: Fixture, difficulty: AIDifficulty, draws = 16): Promise<Block> {
  const row: Block = {fixture,difficulty,samples:5000,active:false,root:null,candidate:null,pairs:[],failure:null};
  try {
    const first = holdings(fixture,"broad")[0], input = context(materialize(fixture,first),difficulty);
    const baseline = await new OpeningAwareEquityRulesBot().decide(input), candidate = override(input,baseline);
    row.root=baseline.action; row.candidate=candidate.action; row.active=candidate!==baseline;
    for (const range of ranges) for (const [draw,holding] of holdings(fixture,range).slice(0,draws).entries()) for (const policy of policies) {
      const run=materialize(fixture,holding), randomSeed=`${fixture.spec.id}/${range}/${draw}/${policy}/responses-v1`;
      const base=await continuation(run,baseline.action,difficulty,policy,randomSeed);
      const changed=row.active ? await continuation(run,candidate.action,difficulty,policy,randomSeed) : base;
      row.pairs.push({range,policy,draw,holding,baseline:base,candidate:changed});
    }
  } catch (error) { row.failure=error instanceof Error ? error.message : "rollout_failed"; }
  return row;
}
