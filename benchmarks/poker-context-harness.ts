import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { createPokerAIState } from "@/lib/poker/ai-state";
import { projectBotHistory, legacyDecisionHistory, type BotHandContext } from "@/lib/poker/bot-history";
import { prepareProviderContext } from "@/lib/poker/provider-context";
import { createSizingOptions, createLegacySizingOptions } from "@/lib/typesafe/questions";
import type { PokerAction, PokerGameState } from "@/lib/poker/types";
import type { BotContext, BotDecision, PokerBot } from "@/lib/bots/types";
import { createPokerAIState as baselineState } from "./baselines/ai-state-v2";
import { createSizingOptions as baselineSizing } from "./baselines/questions-v2";

export type EvaluationVariant = "baseline" | "facts" | "facts-guidance";
export const handClasses = (() => {
  const result: { notation: string; cards: readonly string[]; weight: number }[] = [];
  const ranks = "AKQJT98765432";
  for (let high = 0; high < 13; high++) {
    result.push({ notation: ranks[high]+ranks[high], cards: [ranks[high]+"s",ranks[high]+"h"], weight: 6 });
    for (let low = high+1; low < 13; low++) {
      result.push({ notation: ranks[high]+ranks[low]+"s", cards: [ranks[high]+"s",ranks[low]+"s"], weight: 4 });
      result.push({ notation: ranks[high]+ranks[low]+"o", cards: [ranks[high]+"s",ranks[low]+"h"], weight: 12 });
    }
  }
  return result;
})();
export const preflopNodes = [
  ...["UTG","hijack","cutoff","button","small_blind"].map(position => ({ id: `six-open-${position}`, seats: 6, position, line: "open" })),
  { id: "six-button-v-UTG", seats:6, position:"button", line:"raised" },
  { id: "six-BB-v-UTG", seats:6, position:"big_blind", line:"raised" },
  { id: "HU-open", seats:2, position:"button", line:"open" },
  { id: "HU-defend", seats:2, position:"big_blind", line:"raised" },
  { id: "six-button-limped", seats:6, position:"button", line:"limped" },
  { id: "six-button-reraised", seats:6, position:"button", line:"reraised" },
] as const;
export function evaluationContext(state: PokerGameState, history: BotHandContext, variant: EvaluationVariant, samples = 100, rules = false): BotContext {
  const actor = engine.snapshot(state).currentActorId!;
  if (variant === "baseline") {
    const old = baselineState(state, actor, { equitySamples: samples, actionHistory: history.actions.map(item => {
      if (!item.action || !item.stateBefore) throw new Error("Incomplete baseline history");
      const view = engine.decisionView(item.stateBefore);
      const player = state.config.players.find(p => p.seat === view.currentActorSeat)!;
      if (view.street === "complete") throw new Error("Completed pre-action state");
      return { sequence:item.sequence, street:view.street, action:item.action.type,
        amount:"amount" in item.action ? item.action.amount ?? null : null, player:player.name, controller:"bot" as const };
    }) });
    return { ...old, sizingOptions: baselineSizing(old) };
  }
  const projected = projectBotHistory(history, state, actor);
  const ai = createPokerAIState(state, actor, { correctedContext:!rules, equitySamples:samples,
    decisionHistory:rules ? legacyDecisionHistory(projected.actions) : projected.actions, historyStatus:projected.status });
  if (rules) return { ...ai,sizingOptions:createLegacySizingOptions(ai) };
  return prepareProviderContext({ ...ai, sizingOptions:createSizingOptions(ai) });
}
export function buildPreflopNode(node: typeof preflopNodes[number], cards: readonly string[], variant: EvaluationVariant = "facts", samples = 100) {
  const config = { smallBlind:1, bigBlind:2, seatCount:node.seats,
    players:Array.from({ length:node.seats }, (_,seat) => ({ id:`p${seat}`, name:`Seat ${seat}`, seat, controller:"bot" as const, stack:200 })) };
  const waiting = engine.createGame(config);
  const preliminary = engine.startHand(waiting, createDeterministicDeck());
  const view = engine.decisionView(preliminary);
  const heroSeat = view.players.find(p => p.position === node.position)!.seat;
  const dealOrder = view.postflopOrder;
  const prefix: string[] = [];
  const available = [...createDeterministicDeck()].map(c => c.rank+c.suit).filter(c => !cards.includes(c));
  for (let round=0; round<2; round++) for (const seat of dealOrder) prefix.push(seat === heroSeat ? cards[round] : available.shift()!);
  let state = engine.startHand(waiting, createDeterministicDeck(prefix));
  const initialState = state;
  const actions: { sequence:number; action:PokerAction; stateBefore:PokerGameState }[] = [];
  while (engine.decisionView(state).currentActorSeat !== heroSeat) {
    const current = engine.decisionView(state);
    const legal = engine.getLegalActions(state);
    let action: PokerAction = { type:"fold" };
    if (actions.length === 0 && node.line === "limped") action = { type:"call", amount:legal.find(a => a.type === "call")!.amount };
    else if ((actions.length === 0 && node.line !== "open") || (actions.length === 1 && node.line === "reraised")) action = { type:"raise", amount:actions.length === 0 ? 6 : 18 };
    const before = state, actor = current.players.find(p => p.seat === current.currentActorSeat)!;
    state = engine.applyAction(state, actor.id, action);
    actions.push({ sequence:actions.length+1, action, stateBefore:before });
  }
  return { state, history:{ version:0, handNumber:1, initialState, actions }, context:evaluationContext(state,{ version:0, handNumber:1, initialState, actions },variant,samples) };
}

/** Shared cap across variants, matches and repetitions, enforced before any request. */
export function cappedBot(bot: PokerBot, budget: { remaining: number }): PokerBot {
  return { async decide(context) {
    if (!Number.isSafeInteger(budget.remaining) || budget.remaining <= 0) throw new Error("Decision-call cap exhausted");
    budget.remaining--;
    return bot.decide(context);
  } };
}
export function liveDecisionBudget(optIn = "BOT_SCENARIO_LIVE") {
  if (process.env[optIn] !== "true" || process.env.EXTERNAL_INFERENCE_ENABLED !== "true") throw new Error("Live evaluation requires explicit inference opt-ins");
  const cap = Number(process.env.BOT_DECISION_CALL_CAP);
  if (!Number.isSafeInteger(cap) || cap <= 0) throw new Error("Supply a positive BOT_DECISION_CALL_CAP");
  return { remaining:cap };
}
export async function evaluatePreflop(bot: PokerBot, variant: EvaluationVariant, repetitions = 2, options: { equitySamples?:number; onProgress?:(rows:readonly unknown[]) => void } = {}) {
  const rows: { node:string; hand:string; weight:number; actions:string[]; sizings:(string|null)[]; failures:number; latencyMs:number[]; usage:unknown[]; policyVersions:string[]; cost:number|null }[] = [];
  for (const node of preflopNodes) for (const hand of handClasses) {
    const { state, context } = buildPreflopNode(node,hand.cards,variant,options.equitySamples ?? 5_000);
    const row: typeof rows[number] = { node:node.id, hand:hand.notation, weight:hand.weight, actions:[], sizings:[], failures:0, latencyMs:[], usage:[], policyVersions:[], cost:null };
    rows.push(row);
    options.onProgress?.(rows);
    for (let repetition=0; repetition<repetitions; repetition++) {
      const started = performance.now();
      try {
        const decision = await bot.decide(context);
        engine.applyAction(state,engine.snapshot(state).currentActorId!,decision.action);
        if (decision.diagnostics.promptVersion) row.policyVersions.push(decision.diagnostics.promptVersion);
        row.actions.push(JSON.stringify(decision.action)); row.sizings.push(decision.diagnostics.sizing?.choice ?? null);
        if (decision.diagnostics.usage !== null) row.usage.push(decision.diagnostics.usage);
        if (decision.diagnostics.cost !== null) row.cost = (row.cost ?? 0) + decision.diagnostics.cost;
      } catch (error) {
        if (error instanceof Error && error.message === "Decision-call cap exhausted") throw error;
        row.failures++;
      } finally { row.latencyMs.push(performance.now()-started); }
    }
    options.onProgress?.(rows);
  }
  const nodes = preflopNodes.map(node => {
    const selected = rows.filter(row => row.node === node.id);
    const actionCounts: Record<string,number> = {}, sizingCounts: Record<string,number> = {};
    let denominator = 0;
    for (const row of selected) for (const [index,action] of row.actions.entries()) {
      const type = (JSON.parse(action) as { type:string }).type;
      actionCounts[type] = (actionCounts[type] ?? 0) + row.weight;
      const sizing = row.sizings[index] ?? "not_applicable";
      sizingCounts[sizing] = (sizingCounts[sizing] ?? 0) + row.weight;
      denominator += row.weight;
    }
    const frequencies = (counts:Record<string,number>) => Object.fromEntries(Object.entries(counts).map(([k,n]) => [k,n/Math.max(1,denominator)]));
    const latency = selected.flatMap(row => row.latencyMs).sort((a,b) => a-b);
    return { node:node.id, actionFrequencies:frequencies(actionCounts), sizingFrequencies:frequencies(sizingCounts),
      repeatedDecisionAgreement:selected.filter(row => row.actions.length === repetitions && new Set(row.actions).size === 1).length/169,
      failures:selected.reduce((sum,row) => sum+row.failures,0), latencyMs:{ mean:latency.reduce((a,b) => a+b,0)/latency.length, p95:latency[Math.floor(latency.length*.95)] },
      policyVersions:[...new Set(selected.flatMap(row => row.policyVersions))],
      usage:selected.flatMap(row => row.usage), cost:selected.some(row => row.cost !== null) ? selected.reduce((sum,row) => sum+(row.cost ?? 0),0) : null };
  });
  return { variant,repetitions,nodes,rows };
}

/** Paired seed means are the independent units; rotations within a seed are correlated. */
export function pairedInterval(differences: readonly number[]) {
  if (differences.length < 2) return null;
  const mean = differences.reduce((a,b) => a+b,0)/differences.length;
  const variance = differences.reduce((sum,n) => sum+(n-mean)**2,0)/(differences.length-1);
  // Normal approximation: descriptive for small samples, never a strength acceptance gate.
  const margin = 1.96*Math.sqrt(variance/differences.length);
  return { mean, confidence95:[mean-margin,mean+margin] };
}
export async function playEvaluationHand(subject: PokerBot, opponent: PokerBot, seats: 2|6, rotation:number, seed:number, variant:EvaluationVariant) {
  let random = seed >>> 0;
  const deck = [...createDeterministicDeck()];
  for (let i=deck.length-1; i>0; i--) { random=(Math.imul(random,1664525)+1013904223)>>>0; const j=Math.floor(random/2**32*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  let state = engine.startHand(engine.createGame({ smallBlind:1,bigBlind:2,seatCount:seats,
    players:Array.from({ length:seats }, (_,seat) => ({ id:`p${seat}`,name:`Seat ${seat}`,seat,controller:"bot",stack:200 })) }),deck);
  const initialState = state;
  const actions: { sequence:number; action:PokerAction; stateBefore:PokerGameState }[] = [];
  const diagnostics: BotDecision["diagnostics"][] = [];
  for (let n=0; n<200 && engine.snapshot(state).street !== "complete"; n++) {
    const view = engine.decisionView(state), actor = view.players.find(p => p.seat === view.currentActorSeat)!;
    const isSubject = actor.seat === rotation;
    const ctx = evaluationContext(state,{ version:0,handNumber:1,initialState,actions },isSubject ? variant : "facts",100,!isSubject);
    const decision = await (isSubject ? subject : opponent).decide(ctx);
    if (isSubject) diagnostics.push(decision.diagnostics);
    const before=state; state=engine.applyAction(state,actor.id,decision.action);
    actions.push({ sequence:actions.length+1,action:decision.action,stateBefore:before });
  }
  if (engine.snapshot(state).street !== "complete") throw new Error("Hand action limit exceeded");
  return { profitBB:(engine.decisionView(state).players.find(p => p.seat === rotation)!.stack-200)/2, diagnostics };
}
export async function compareVariants(subjects: Readonly<Partial<Record<EvaluationVariant,PokerBot>>>, opponent:PokerBot, seats:2|6, seeds:readonly number[], repetitions:number, onProgress?:(rows:readonly unknown[]) => void) {
  const rows: { variant:EvaluationVariant; seed:number; repetition:number; rotation:number; profitBB:number|null; failure:string|null; diagnostics:BotDecision["diagnostics"][] }[] = [];
  for (const seed of seeds) for (let repetition=0; repetition<repetitions; repetition++) for (let rotation=0; rotation<seats; rotation++) {
    for (const variant of ["baseline","facts","facts-guidance"] as const) {
      const subject = subjects[variant];
      if (!subject) continue;
      try { const result=await playEvaluationHand(subject,opponent,seats,rotation,seed,variant); rows.push({ variant,seed,repetition,rotation,...result,failure:null }); }
      catch (error) { if (error instanceof Error && error.message === "Decision-call cap exhausted") throw error;
        rows.push({ variant,seed,repetition,rotation,profitBB:null,diagnostics:[],failure:error instanceof Error ? error.name : "Error" }); }
      onProgress?.(rows);
    }
  }
  const paired = ([ ["baseline","facts"], ["baseline","facts-guidance"], ["facts","facts-guidance"] ] as const).filter(([reference,variant]) => subjects[reference] && subjects[variant]).map(([reference,variant]) => {
    const differences=seeds.flatMap(seed => {
      const baseline=rows.filter(row => row.seed === seed && row.variant === reference);
      const upgraded=rows.filter(row => row.seed === seed && row.variant === variant);
      if ([...baseline,...upgraded].some(row => row.profitBB === null)) return [];
      const mean=(r:typeof rows) => r.reduce((sum,row) => sum+row.profitBB!,0)/r.length;
      return [mean(upgraded)-mean(baseline)];
    });
    return { reference,variant,pairedSeeds:differences.length,interval:pairedInterval(differences) };
  });
  return { seats,seeds,repetitions,rows,paired,failures:rows.filter(row => row.failure !== null).length };
}
