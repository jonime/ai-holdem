import { createHash } from "node:crypto";
import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { projectSessionStats } from "@/lib/poker/session-stats";
import { selectJevOpponentAdvice } from "@/lib/poker/opponent-advice";
import type { BotHandContext } from "@/lib/poker/bot-history";
import type { PokerAction, PokerGameState } from "@/lib/poker/types";
import type { BotContext, PokerBot } from "@/lib/bots/types";
import { evaluationContext } from "../poker-context-harness";

export const design = { version: "session-adaptation-v1", hands: 60, stackBB: 100, samples: 5000, actionGuard: 200, blockCap: 600, ceiling: 5000, prescribed: 4800, compatibility: 0,
  seeds: [19381, 73091], providers: ["jev", "llm"], opponents: ["frequent-folder", "frequent-caller"], menu: "current", models: { jev: "jev-latest", llm: "openai/gpt-5.4-mini" }, difficulty: "medium", reasoning: "low", playstyle: "balanced" } as const;
export type Provider = typeof design.providers[number];
export type Opponent = typeof design.opponents[number];
export interface Block { id: string; provider: Provider; opponent: Opponent; seed: number; order: number }
export const blocks: Block[] = design.seeds.flatMap((seed, i) => design.opponents.flatMap((opponent, j) => design.providers.map((provider, k) => ({ id: `${provider}-${opponent}-${seed}`, provider, opponent, seed, order: i + j + k }))));
export function random(...keys: (string | number)[]) { return createHash("sha256").update(keys.join(":")).digest().readUInt32LE() / 4294967296; }
export function deal(seed: number, hand: number, swapped: boolean) {
  const cards = createDeterministicDeck().map(c => c.rank + c.suit);
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(random(seed, hand, "deal", i) * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  if (swapped) { [cards[0], cards[1]] = [cards[1], cards[0]]; [cards[2], cards[3]] = [cards[3], cards[2]]; }
  return createDeterministicDeck(cards);
}
export interface Episode { id: string; memory: boolean; seat: number; state: PokerGameState; history: BotHandContext[] }
export function episodes(block: Block): Episode[] {
  return [0, 1].flatMap(seat => [true, false].map(memory => ({ id: `${block.id}-${seat}-${memory ? "memory" : "omitted"}`, seat, memory, history: [], state: engine.createGame({ smallBlind: 1, bigBlind: 2, seatCount: 2, players: [0, 1].map(s => ({ id: s === seat ? "subject" : "opponent", name: s === seat ? "Subject" : "Opponent", seat: s, stack: 200, controller: "bot", aiDifficulty: "medium", botProfileId: s === seat && block.provider === "llm" ? "balanced" : null, bot: { id: s === seat ? block.provider : block.opponent, label: "Synthetic", provider: s === seat ? block.provider === "jev" ? "typesafe" : "llm" : "rules", modelId: s === seat ? design.models[block.provider] : null } })) }) })));
}
export function start(episode: Episode, block: Block, hand: number) {
  let state = episode.state;
  if (hand > 1) for (const player of [...state.config.players]) { state = engine.removePlayer(state, player.id); state = engine.seatPlayer(state, { ...player, stack: 200 }); }
  state = engine.startHand(state, deal(block.seed, hand, episode.seat === 1));
  const view = engine.decisionView(state);
  if (view.handNumber !== hand || view.players.some(p => p.stack + p.committedStreet !== 200)) throw new Error("Reset invariant");
  if (hand > 1 && view.buttonSeat === engine.decisionView(episode.state).buttonSeat) throw new Error("Button rotation invariant");
  return state;
}
export function contextFor(episode: Episode, state: PokerGameState, currentHand: BotHandContext, samples = 5000, rules = false): BotContext {
  const base = evaluationContext(state, currentHand, "facts", samples, rules);
  const stats = measurementStats(episode, state, currentHand);
  return episode.memory ? { ...base, sessionStats: stats } : base;
}
export function measurementStats(episode: Episode, state: PokerGameState, currentHand: BotHandContext) {
  return projectSessionStats({ gameId: episode.id, version: 0, currentHand, previousHands: episode.history.slice(-50) }, state, "subject");
}
/** Only the script's visible state and keyed independent draw enter this policy. */
export function script(state: PokerGameState, opponent: Opponent, seed: number, hand: number, index: number): PokerAction {
  const view = engine.decisionView(state), legal = engine.getLegalActions(state), draw = random(seed, hand, "opponent", index);
  if (view.street === "preflop" && index === 0 && view.currentActorSeat === view.buttonSeat) {
    const raise = legal.find(a => a.type === "raise");
    if (draw < 0.6 && raise?.type === "raise") return { type: "raise", amount: Math.max(raise.minAmount, Math.min(raise.maxAmount, 5)) };
    const call = legal.find(a => a.type === "call"); if (call) return { type: "call", amount: call.amount };
  }
  if (legal.some(a => a.type === "check")) return { type: "check" };
  const call = legal.find(a => a.type === "call");
  return call && draw < (opponent === "frequent-folder" ? 0.2 : 0.85) ? { type: "call", amount: call.amount } : { type: "fold" };
}
export interface DecisionRow { block: string; episode: string; hand: number; index: number; role: "subject" | "opponent"; memory: boolean; seat: number; action: PokerAction; sizing: string | null; paymentBB: number; potFraction: number | null; stackFraction: number; observations: BotContext["sessionStats"] | null; advice: number; confidenceSignal: number; usable: boolean; latencyMs: number; cost: number | null; revision: string | null }
export interface HandRow { block: string; episode: string; hand: number; memory: boolean; seat: number; profitBB: number }
export interface Hooks { decide: (context: BotContext) => ReturnType<PokerBot["decide"]>; decision: (row: DecisionRow) => void; completed: (row: HandRow) => void }
export async function playHand(episode: Episode, block: Block, hand: number, hooks: Hooks, samples = 5000) {
  let state = start(episode, block, hand);
  const initialState = state, actions: BotHandContext["actions"][number][] = [];
  let scriptIndex = 0;
  while (engine.snapshot(state).street !== "complete") {
    if (actions.length >= design.actionGuard) throw new Error("Action guard invariant");
    const view = engine.decisionView(state), actor = engine.snapshot(state).currentActorId!, subject = actor === "subject";
    const currentHand = { version: 0, handNumber: hand, initialState, actions };
    const context = subject ? contextFor(episode, state, currentHand, samples) : null;
    const started = performance.now();
    const decision = context ? await hooks.decide(context) : null;
    const action = decision?.action ?? script(state, block.opponent, block.seed, hand, scriptIndex++);
    const player = view.players.find(p => p.id === actor)!;
    const payment = action.type === "raise" || action.type === "bet" ? action.amount - player.committedStreet : action.type === "call" ? engine.getLegalActions(state).find(a => a.type === "call")!.amount! : 0;
    const after = engine.applyAction(state, actor, action);
    const stats = subject ? measurementStats(episode, state, currentHand) : null;
    const response: unknown = decision?.rawResponse;
    const raw: unknown = response && typeof response === "object" && "providerResponse" in response ? response.providerResponse : response;
    const revision = raw && typeof raw === "object" && "model" in raw && typeof raw.model === "string" && /^[a-zA-Z0-9/._:-]{1,160}$/.test(raw.model) ? raw.model : null;
    hooks.decision({ block: block.id, episode: episode.id, hand, index: actions.length, role: subject ? "subject" : "opponent", memory: episode.memory, seat: episode.seat, action, sizing: decision?.diagnostics.sizing?.choice ?? null, paymentBB: payment / 2, potFraction: view.pot ? payment / view.pot : null, stackFraction: player.stack ? payment / player.stack : 0, observations: stats, advice: context && block.provider === "jev" ? selectJevOpponentAdvice(context).length : 0, confidenceSignal: context ? selectJevOpponentAdvice(context).length : 0, usable: !!stats?.participants.some(p => p.role === "opponent" && Object.values(p.headsUp).some(m => m.evidence === "observed")), latencyMs: Math.round(performance.now() - started), cost: decision?.diagnostics.cost !== null && Number.isFinite(decision?.diagnostics.cost) && decision!.diagnostics.cost! >= 0 ? decision!.diagnostics.cost : null, revision });
    actions.push({ sequence: actions.length + 1, action, stateBefore: state }); state = after;
  }
  const final = engine.decisionView(state);
  if (final.players.reduce((n, p) => n + p.stack, 0) !== 400) throw new Error("Chip conservation invariant");
  const history = { version: 0, handNumber: hand, initialState, actions, finalState: state };
  // Validate this complete hand immediately, including the last hand of each episode.
  const { projectBotHistory } = await import("@/lib/poker/bot-history");
  if (projectBotHistory(history, state, "subject").status !== "complete") throw new Error("Replay invariant");
  episode.history.push(history); episode.state = state;
  hooks.completed({ block: block.id, episode: episode.id, hand, memory: episode.memory, seat: episode.seat, profitBB: (final.players.find(p => p.id === "subject")!.stack - 200) / 2 });
}
export function schedule(order: number, hand: number) { const base = order % 2 ? [1, 0, 3, 2] : [0, 1, 2, 3]; const shift = (hand - 1) % 4; return [...base.slice(shift), ...base.slice(0, shift)]; }
