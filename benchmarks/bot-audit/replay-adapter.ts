/** Benchmark-only reconstruction boundary. Never mutates an in-progress engine state. */
import { z } from "zod";
import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import type { GameConfig, PokerAction, PokerGameState } from "@/lib/poker/types";
import type { BotHandContext } from "@/lib/poker/bot-history";

// Installed engine 1.0.1 has no start-button option. Change only validated waiting
// metadata, then restore and start through the production adapter. No hand internals.
const waitingSchema = z.object({ hand: z.null(), handNumber: z.number().int().nonnegative(), buttonSeat: z.number().int().nullable() }).passthrough();
export interface ReplaySpec {
  id: string; config: GameConfig; button: number; handNumber: number;
  deck: readonly string[]; line: readonly { seat: number; action: PokerAction }[];
}
export function replay(spec: ReplaySpec) {
  const seats = spec.config.seatCount ?? spec.config.players.length;
  if (!Number.isInteger(spec.button) || spec.button < 0 || spec.button >= seats || !Number.isSafeInteger(spec.handNumber) || spec.handNumber < 1) throw new Error("Invalid replay metadata");
  // Full decks, unlike prefixes, must never silently fill missing or duplicate cards.
  if (spec.deck.length !== 52 || new Set(spec.deck).size !== 52) throw new Error("Card collision or incomplete deck");
  let waiting = engine.createGame(spec.config);
  const metadata = waitingSchema.parse(waiting.engineState);
  waiting = engine.restore({ ...waiting, engineState: { ...metadata, buttonSeat: (spec.button + seats - 1) % seats, handNumber: spec.handNumber - 1 } });
  let state = engine.startHand(waiting, createDeterministicDeck(spec.deck));
  const initialState = state;
  if (engine.decisionView(state).buttonSeat !== spec.button) throw new Error("Unsupported button mapping");
  const actions: BotHandContext["actions"][number][] = [];
  for (const step of spec.line) {
    const view = engine.decisionView(state);
    if (view.currentActorSeat !== step.seat) throw new Error("Invalid transformed history actor");
    actions.push({ sequence: actions.length + 1, action: step.action, stateBefore: state });
    state = engine.applyAction(state, engine.snapshot(state).currentActorId!, step.action);
  }
  return { state, history: { version: 0, handNumber: spec.handNumber, initialState, actions } satisfies BotHandContext };
}
export function specFromHistory(id: string, state: PokerGameState, history: BotHandContext): ReplaySpec {
  if (!history.initialState) throw new Error("Missing initial state");
  const initial = history.initialState, v = engine.decisionView(initial);
  // Benchmark preflop nodes expose no board yet; deterministic suffix is recreated.
  if (v.street !== "preflop") throw new Error("Expected initial preflop state");
  const prefix = [0, 1].flatMap(round => v.postflopOrder.map(seat => engine.heroCards(initial, v.players.find(p => p.seat === seat)!.id)[round]));
  const deck = createDeterministicDeck(prefix).map(c => c.rank + c.suit);
  return { id, config: { ...state.config, players: state.config.players.map(p => ({ ...p, stack: v.players.find(q => q.id === p.id)!.stack + v.players.find(q => q.id === p.id)!.committedHand })) },
    button: v.buttonSeat, handNumber: v.handNumber, deck,
    line: history.actions.map(item => { if (!item.action || !item.stateBefore) throw new Error("Incomplete history"); return { seat: engine.decisionView(item.stateBefore).currentActorSeat!, action: item.action }; }) };
}
