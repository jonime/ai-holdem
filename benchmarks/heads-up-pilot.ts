/** Extension of the shared context benchmark; no production configuration writes. */
import { pokerEngineAdapter as engine, createDeterministicDeck } from "@/lib/poker/adapter";
import { createPokerAIState } from "@/lib/poker/ai-state";
import { projectBotHistory, legacyDecisionHistory, type BotHandContext } from "@/lib/poker/bot-history";
import { projectSessionStats } from "@/lib/poker/session-stats";
import { prepareProviderContext } from "@/lib/poker/provider-context";
import { createSizingOptions, createLegacySizingOptions } from "@/lib/typesafe/questions";
import { JevPokerBot } from "@/lib/bots/jev";
import { LlmPokerBot } from "@/lib/bots/llm";
import { JevPokerBot as CurrentJev } from "./baselines/jev-v3";
import { LlmPokerBot as CurrentLlm } from "./baselines/llm-v3";
import { BotProviderError, emptyDiagnostics, type BotContext, type BotDiagnostics, type PokerBot } from "@/lib/bots/types";
import type { TypesafeDecisionClient } from "@/lib/typesafe/decision";
import type { ProviderFetch } from "@/lib/bots/provider-request";
import type { PokerAction, PokerGameState } from "@/lib/poker/types";
import { buildPreflopNode, preflopNodes, pairedInterval, cappedBot } from "./poker-context-harness";
import { buildScenario, scenarios } from "./scenarios/harness";

export const pilotModels = { nano: "openai/gpt-5-nano", mini: "openai/gpt-5.4-mini" } as const;
export const pilotIds = ["jev-current", "jev-guidance", "jev-history", "nano-current", "nano-guidance", "nano-history", "nano-low-history", "mini-low-history"] as const;
export type PilotId = typeof pilotIds[number];

/** Gateway compatibility checks are part of the capped decisions, not extra paid probes. */
export function openRouterPilotFetch(fetcher: ProviderFetch = fetch): ProviderFetch {
  return async (url, init) => {
    if (new URL(url).origin !== "https://openrouter.ai") throw new Error("Pilot requires the configured OpenRouter gateway");
    const request = JSON.parse(String(init.body));
    const response = await fetcher(url, { ...init, body: JSON.stringify({ ...request, provider: { allow_fallbacks: false, require_parameters: true } }) });
    if (response.ok) {
      const body: unknown = await response.clone().json();
      if (typeof body !== "object" || body === null || !("model" in body) ||
          typeof body.model !== "string" || !(body.model === request.model || body.model.startsWith(`${request.model}-`))) {
        throw new BotProviderError("Pilot gateway returned an unexpected model", undefined, { category: "invalid_response", phase: "response" });
      }
    }
    return response;
  };
}
function withoutHistory(bot: PokerBot): PokerBot {
  return { decide(context) {
    const { sessionStats, ...rest } = context;
    void sessionStats;
    return bot.decide(rest);
  } };
}
export function pilotVariants(client: TypesafeDecisionClient, fetcher: ProviderFetch = openRouterPilotFetch()): Record<PilotId, PokerBot> {
  const llm = (modelId: string, reasoning: "minimal" | "low") => new LlmPokerBot(modelId, { profileId: "balanced", reasoning }, fetcher);
  return {
    "jev-current": new CurrentJev(client), "jev-guidance": withoutHistory(new JevPokerBot(client)), "jev-history": new JevPokerBot(client),
    "nano-current": new CurrentLlm(pilotModels.nano, { profileId: "balanced", reasoning: "minimal" }, fetcher),
    "nano-guidance": withoutHistory(llm(pilotModels.nano, "minimal")), "nano-history": llm(pilotModels.nano, "minimal"),
    "nano-low-history": llm(pilotModels.nano, "low"), "mini-low-history": llm(pilotModels.mini, "low"),
  };
}

/** Fixed synthetic recorded actions, not an inferred profile or a model notebook.
 * Twenty complete hands, paired identical lines across alternating buttons, restore
 * starting stacks. Historical holdings never contribute to projected statistics.
 */
export function withPilotHistory(state: PokerGameState, currentActions: readonly PokerAction[], deck: readonly string[], equitySamples = 5000): { state: PokerGameState; context: BotContext; history: BotHandContext } {
  const players = state.config.players.map(player => ({ ...player, bot: { id: "fixture", label: "Fixture", provider: "rules" as const, modelId: null }, aiDifficulty: "medium" as const }));
  let replay = engine.createGame({ ...state.config, players });
  const previousHands: BotHandContext[] = [];
  for (let n = 0; n < 20; n++) {
    replay = engine.startHand(replay, createDeterministicDeck());
    const initialState = replay;
    const line: PokerAction[] = n < 8 ? [{ type: "raise", amount: 6 }, { type: "fold" }]
      : n < 14 ? [{ type: "call" }, { type: "check" }, { type: "bet", amount: 2 }, { type: "fold" }]
        : [{ type: "call" }, { type: "raise", amount: 6 }, { type: "fold" }];
    const actions: BotHandContext["actions"][number][] = [];
    for (const action of line) {
      actions.push({ sequence: actions.length + 1, action, stateBefore: replay });
      replay = engine.applyAction(replay, engine.snapshot(replay).currentActorId!, action);
    }
    previousHands.push({ version: 0, handNumber: n + 1, initialState, actions, finalState: replay });
  }
  replay = engine.startHand(replay, createDeterministicDeck(deck));
  const initialState = replay;
  const actions: BotHandContext["actions"][number][] = [];
  for (const action of currentActions) {
    actions.push({ sequence: actions.length + 1, action, stateBefore: replay });
    replay = engine.applyAction(replay, engine.snapshot(replay).currentActorId!, action);
  }
  const hero = engine.snapshot(replay).currentActorId!;
  const handNumber = engine.snapshot(replay).handNumber;
  const currentHand = { version: 0, handNumber, initialState, actions };
  const projected = projectBotHistory(currentHand, replay, hero);
  const ai = createPokerAIState(replay, hero, { correctedContext: true, equitySamples, historyStatus: projected.status, decisionHistory: projected.actions });
  const sessionStats = projectSessionStats({ gameId: "synthetic-pilot", version: 0, currentHand, previousHands }, replay, hero);
  return { state: replay, history: currentHand, context: prepareProviderContext({ ...ai, sessionStats, sizingOptions: createSizingOptions(ai) }) };
}
export interface PilotCase {
  readonly id: string;
  readonly state: PokerGameState;
  readonly context: BotContext;
  readonly forbidden: readonly PokerAction["type"][];
  readonly missedValue: readonly PokerAction["type"][];
  readonly overAggression: readonly PokerAction["type"][];
}
export function pilotCases(equitySamples = 5000): PilotCase[] {
  const result: PilotCase[] = [];
  const holdings = [["As", "Ks"], ["8s", "8h"], ["Js", "Ts"], ["7s", "2h"]];
  for (const depth of [10, 25, 100]) for (const position of ["HU-open", "HU-defend"]) for (const cards of holdings) {
    const fixture = buildPreflopNode(preflopNodes.find(node => node.id === position)!, cards, "facts", 5, { stackBB: depth });
    const initial = fixture.history.initialState!;
    // Deck is reconstructed from the installed adapter's observable fixture deal.
    const order = engine.decisionView(initial).postflopOrder;
    const prefix = [0, 1].flatMap(round => order.map(seat => engine.heroCards(initial, `p${seat}`)[round]));
    const history = withPilotHistory(initial, fixture.history.actions.map(item => item.action!), prefix, equitySamples);
    result.push({ id: `${position}-${depth}-${cards.join("")}`, ...history, forbidden: [], missedValue: [], overAggression: [] });
  }
  // Eight additional preflop pressure cases: limps, large opens, re-raises and unequal stacks.
  const node = preflopNodes.find(candidate => candidate.id === "HU-open")!;
  for (const [index, line] of [
    [{ type: "call" }], [{ type: "raise", amount: 12 }], [{ type: "raise", amount: 4 }, { type: "raise", amount: 12 }],
    [{ type: "call" }, { type: "raise", amount: 8 }],
  ].entries()) for (const cards of [holdings[0], holdings[2]]) {
    const fixture = buildPreflopNode(node, cards, "facts", 5, { stackBB: index % 2 ? 25 : 100, opponentStackBB: 100 });
    const initial = fixture.history.initialState!;
    const order = engine.decisionView(initial).postflopOrder;
    const prefix = [0, 1].flatMap(round => order.map(seat => engine.heroCards(initial, `p${seat}`)[round]));
    result.push({ id: `HU-pressure-${index}-${cards.join("")}`, ...withPilotHistory(initial, line as PokerAction[], prefix, equitySamples), forbidden: [], missedValue: [], overAggression: [] });
  }
  const postflop = ["flop-made-facing-bet", "flop-draw-facing-bet", "turn-missed-draw-pressure", "turn-draw-improvement", "royal-flush-facing-bet", "royal-board-facing-small-bet", "board-quads-low-kicker-facing-all-in", "flop-free-check"];
  for (const id of postflop) {
    const scenario = scenarios.find(candidate => candidate.id === id)!;
    const fixture = buildScenario(scenario, { provider: "llm" });
    const waitingConfig = { ...fixture.state.config, players: fixture.state.config.players.map((player, index) => ({ ...player, stack: scenario.stacks[index] })) };
    const initial = engine.startHand(engine.createGame(waitingConfig), createDeterministicDeck(scenario.deck));
    result.push({ id, ...withPilotHistory(initial, scenario.actions.map(step => step.action), scenario.deck, equitySamples), forbidden: scenario.forbidden,
      // Only exact value/split safeguards are graded. Other strategic decisions are observations.
      missedValue: id === "royal-flush-facing-bet" || id === "royal-board-facing-small-bet" ? ["fold"] : [],
      overAggression: id === "royal-board-facing-small-bet" || id === "board-quads-low-kicker-facing-all-in" ? ["raise"] : [] });
  }
  if (result.length !== 40) throw new Error("Pilot requires exactly 40 fixed cases");
  return result;
}

export function sanitizedDiagnostics(diagnostics: BotDiagnostics) {
  const usage = diagnostics.usage;
  const number = (key: string) => typeof usage === "object" && usage !== null && key in usage &&
    typeof Reflect.get(usage, key) === "number" && Number.isFinite(Reflect.get(usage, key)) ? Reflect.get(usage, key) as number : null;
  return { policy: diagnostics.promptVersion, latencyMs: diagnostics.durationMs,
    tokens: { input: number("prompt_tokens"), output: number("completion_tokens"), total: number("total_tokens") }, cost: diagnostics.cost };
}
export interface PilotRow {
  variant: PilotId; caseId: string; repetition: number; opportunity: string; action: PokerAction["type"] | null;
  failure: "provider" | "invariant" | null; missedValue: boolean; overAggression: boolean;
  diagnostics: ReturnType<typeof sanitizedDiagnostics> | null;
}
export async function evaluatePilotCases(variants: Record<PilotId, PokerBot>, budget: { remaining: number }, cases: readonly PilotCase[], onProgress: (rows: readonly PilotRow[]) => void = () => {}) {
  const rows: PilotRow[] = [];
  const capped = Object.fromEntries(pilotIds.map(id => [id, cappedBot(variants[id], budget)])) as Record<PilotId, PokerBot>;
  for (const fixture of cases) for (let repetition = 0; repetition < 2; repetition++) {
    // Independent variants; cap reservation occurs synchronously before each call.
    await Promise.all(pilotIds.map(async variant => {
      const context = fixture.context;
      const row: PilotRow = { variant, caseId: fixture.id, repetition,
        opportunity: `${context.situation?.dealtPlayerCount === 2 ? "HU" : "multiway"}:${context.hand.street}:${context.hero.position}:${context.situation?.preflop}:${context.hero.amountToCall ? "facing" : "free"}`,
        action: null, failure: null, missedValue: false, overAggression: false, diagnostics: null };
      rows.push(row);
      try {
        const decision = await capped[variant].decide(context);
        row.action = decision.action.type;
        row.diagnostics = sanitizedDiagnostics(decision.diagnostics);
        try { engine.applyAction(fixture.state, engine.snapshot(fixture.state).currentActorId!, decision.action);
          if (fixture.forbidden.includes(decision.action.type)) row.failure = "invariant";
        } catch { row.failure = "invariant"; }
        row.missedValue = fixture.missedValue.includes(decision.action.type);
        row.overAggression = fixture.overAggression.includes(decision.action.type);
      } catch (error) {
        if (error instanceof Error && error.message === "Decision-call cap exhausted") throw error;
        row.failure = "provider";
      } finally { onProgress(rows); }
    }));
  }
  return rows;
}
export function summarizePilot(rows: readonly PilotRow[]) {
  return pilotIds.map(variant => {
    const selected = rows.filter(row => row.variant === variant);
    const latency = selected.flatMap(row => row.diagnostics?.latencyMs === null || !row.diagnostics ? [] : [row.diagnostics.latencyMs]).sort((a, b) => a - b);
    const opportunities = [...new Set(selected.map(row => row.opportunity))].map(opportunity => {
      const group = selected.filter(row => row.opportunity === opportunity);
      return { opportunity, attempts: group.length, successes: group.filter(row => row.action !== null && !row.failure).length,
        actions: Object.fromEntries(["fold", "check", "call", "bet", "raise"].map(action => [action, group.filter(row => row.action === action).length])) };
    });
    const costs = selected.flatMap(row => row.diagnostics?.cost === null || !row.diagnostics ? [] : [row.diagnostics.cost]);
    return { variant, attempts: selected.length, failures: selected.filter(row => row.failure).length,
      invariantFailures: selected.filter(row => row.failure === "invariant").length,
      missedValue: selected.filter(row => row.missedValue).length, overAggression: selected.filter(row => row.overAggression).length,
      opportunities, latencyMs: { median: latency[Math.floor(latency.length / 2)] ?? null, p95: latency[Math.floor(latency.length * .95)] ?? null },
      cost: { knownRequests: costs.length, totalKnown: costs.reduce((sum, cost) => sum + cost, 0), complete: costs.length === selected.length },
      tokens: { knownRequests: selected.filter(row => row.diagnostics?.tokens.total !== null && row.diagnostics).length,
        totalKnown: selected.reduce((sum, row) => sum + (row.diagnostics?.tokens.total ?? 0), 0) } };
  });
}

export function fixedOpponent(aggressive: boolean): PokerBot {
  return { async decide(context) {
    const pressure = context.legalActions.find(action => action.type === "raise" || action.type === "bet");
    const passive = context.legalActions.find(action => action.type === "check" || action.type === "call");
    const action: PokerAction = aggressive && pressure && (pressure.type === "bet" || pressure.type === "raise")
      ? { type: pressure.type, amount: pressure.minAmount } : passive?.type === "call" || passive?.type === "check" ? passive : { type: "fold" };
    return { action, diagnostics: emptyDiagnostics(), rawResponse: null };
  } };
}
export interface PilotMatchRow { variant: PilotId; opponent: string; seed: number; rotation: number; profitBB: number | null; complete: boolean; diagnostics: ReturnType<typeof sanitizedDiagnostics>[] }
/** Full paired block = all eight variants in both seats. Reserve a worst-case
 * 12-action hand bound (at most six subject calls) before starting each block.
 * Truncated/failed blocks never enter comparative chip estimates.
 */
export async function evaluatePilotMatches(variants: Record<PilotId, PokerBot>, budget: { remaining: number }, opponents: Readonly<Record<string, PokerBot>>, onProgress: (rows: readonly PilotMatchRow[]) => void = () => {}, startSeed = 101, equitySamples = 5000) {
  const rows: PilotMatchRow[] = [];
  let seed = startSeed;
  for (const [opponentName, opponent] of Object.entries(opponents)) {
    if (budget.remaining < pilotIds.length * 2 * 6) break;
    const block: PilotMatchRow[] = [];
    for (const variant of pilotIds) for (let rotation = 0; rotation < 2; rotation++) {
      // Reuse fixed historical context for an opening. Same shuffled deal across variants/seats.
      let random = seed;
      const deck = [...createDeterministicDeck()].map(card => card.rank + card.suit);
      for (let n = deck.length - 1; n > 0; n--) { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; const j = Math.floor(random / 2 ** 32 * (n + 1)); [deck[n], deck[j]] = [deck[j], deck[n]]; }
      const base = buildPreflopNode(preflopNodes.find(node => node.id === "HU-open")!, ["As", "Ks"], "facts", 5);
      const row: PilotMatchRow = { variant, opponent: opponentName, seed, rotation, profitBB: null, complete: false, diagnostics: [] };
      const actions: PokerAction[] = [];
      try {
        for (let n = 0; n < 12; n++) {
          const fixture = withPilotHistory(base.history.initialState!, actions, deck, equitySamples);
          if (fixture.context.hero.seat === rotation) {
            if (row.diagnostics.length >= 6) break;
            const decision = await cappedBot(variants[variant], budget).decide(fixture.context);
            row.diagnostics.push(sanitizedDiagnostics(decision.diagnostics));
            actions.push(decision.action);
          } else {
            let opponentContext = fixture.context;
            if (opponentName === "rules") {
              const hero = engine.snapshot(fixture.state).currentActorId!;
              const projected = projectBotHistory(fixture.history, fixture.state, hero);
              const ai = createPokerAIState(fixture.state, hero, { correctedContext: false, equitySamples,
                decisionHistory: legacyDecisionHistory(projected.actions), historyStatus: projected.status });
              opponentContext = { ...ai, sizingOptions: createLegacySizingOptions(ai) };
            }
            actions.push((await opponent.decide(opponentContext)).action);
          }
          const after = engine.applyAction(fixture.state, engine.snapshot(fixture.state).currentActorId!, actions.at(-1)!);
          if (engine.snapshot(after).street === "complete") {
            row.complete = true; row.profitBB = (engine.decisionView(after).players.find(player => player.seat === rotation)!.stack - 200) / 2;
            break;
          }
        }
      } catch { /* Fixed classification; never serialize exceptions/provider messages. */ }
      block.push(row); rows.push(row); onProgress(rows);
    }
    if (!block.every(row => row.complete)) for (const row of block) row.profitBB = null;
    onProgress(rows);
    seed++;
  }
  const comparisons = pilotMatchComparisons(rows);
  return { rows, comparisons, exploratory: true };
}

export function pilotMatchComparisons(rows: readonly PilotMatchRow[]) {
  return pilotIds.filter(id => id !== "nano-current").map(variant => {
    const differences = [...new Set(rows.map(row => row.seed))].flatMap(seed => {
      const block = rows.filter(row => row.seed === seed);
      if (block.length !== pilotIds.length * 2 || block.some(row => row.profitBB === null)) return [];
      const mean = (id: PilotId) => block.filter(row => row.variant === id).reduce((sum, row) => sum + row.profitBB!, 0) / 2;
      return [mean(variant) - mean("nano-current")];
    });
    return { reference: "nano-current", variant, completeBlocks: differences.length, interval: pairedInterval(differences) };
  });;
}
