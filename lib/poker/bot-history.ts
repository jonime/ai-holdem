import "server-only";
import { isDeepStrictEqual } from "node:util";
import { pokerEngineAdapter } from "./adapter";
import type { PokerAction, PokerGameState } from "./types";
import type { PokerAIDecisionHistoryItem } from "./ai-state";

export interface BotHandContext {
  readonly version: number;
  readonly handNumber: number;
  readonly initialState: PokerGameState | null;
  readonly actions: readonly {
    readonly sequence: number;
    readonly action: PokerAction | null;
    readonly stateBefore: PokerGameState | null;
  }[];
}
export class BotHistoryConflictError extends Error {}

/** Replay private states locally, then project a strict allowlist of visible facts. */
export function projectBotHistory(history: BotHandContext | null, decision: PokerGameState, heroId: string): {
  readonly status: "complete" | "unknown";
  readonly actions: readonly PokerAIDecisionHistoryItem[];
} {
  if (!history?.initialState) return { status: "unknown", actions: [] };
  const initial = pokerEngineAdapter.restore(history.initialState);
  if (pokerEngineAdapter.snapshot(initial).handNumber !== history.handNumber ||
      pokerEngineAdapter.snapshot(decision).handNumber !== history.handNumber) throw new BotHistoryConflictError();
  let replay = initial;
  let complete = true;
  let replayKnown = true;
  let previousSequence = 0;
  const actions: PokerAIDecisionHistoryItem[] = [];
  for (const [index, item] of history.actions.entries()) {
    if (item.sequence !== index + 1) complete = false;
    if (!item.action || !item.stateBefore) { complete = false; replayKnown = false; previousSequence = item.sequence; continue; }
    const before = pokerEngineAdapter.restore(item.stateBefore);
    if (replayKnown && item.sequence === previousSequence + 1 && !isDeepStrictEqual(replay.engineState, before.engineState)) throw new BotHistoryConflictError();
    const view = pokerEngineAdapter.decisionView(before);
    if (view.handNumber !== history.handNumber || view.street === "complete") throw new BotHistoryConflictError();
    const actor = view.players.find(p => p.seat === view.currentActorSeat);
    const config = initial.config.players.find(p => p.id === actor?.id && p.seat === actor?.seat);
    if (!actor || !config) { complete = false; replayKnown = false; previousSequence = item.sequence; continue; }
    const after = pokerEngineAdapter.applyAction(before, actor.id, item.action);
    const payment = item.action.type === "bet" || item.action.type === "raise"
      ? item.action.amount - actor.committedStreet
      : item.action.type === "call"
        ? pokerEngineAdapter.getLegalActions(before).find(a => a.type === "call")?.amount ?? 0 : 0;
    const callCost = Math.min(actor.stack, Math.max(0, view.currentBet - actor.committedStreet));
    actions.push({
      sequence: item.sequence, street: view.street, action: item.action.type,
      amount: "amount" in item.action ? item.action.amount ?? null : null,
      actorSeat: actor.seat, actor: actor.id === heroId ? "hero" : "opponent",
      controller: config.controller === "human" ? "human" : "bot",
      payment, commitment: item.action.type === "bet" || item.action.type === "raise" ? item.action.amount : actor.committedStreet + payment,
      potBefore: view.pot, potAfter: pokerEngineAdapter.snapshot(after).pot,
      raiseIncrement: Math.max(0, payment - callCost),
      pressureRatio: (item.action.type === "bet" || item.action.type === "raise") && view.pot + callCost > 0
        ? (payment - callCost) / (view.pot + callCost) : 0,
      activeSeats: view.players.filter(p => !p.folded).map(p => p.seat),
    });
    replay = after;
    replayKnown = true;
    previousSequence = item.sequence;
  }
  if (replayKnown && !isDeepStrictEqual(replay.engineState, decision.engineState)) throw new BotHistoryConflictError();
  return { status: complete ? "complete" : "unknown", actions };
}

/** Preserve the Equity Rules policy's existing hash/equity inputs. */
export function legacyDecisionHistory(history: readonly PokerAIDecisionHistoryItem[]): readonly PokerAIDecisionHistoryItem[] {
  return history.map(({ sequence, street, action, amount, actorSeat, actor, controller }) =>
    ({ sequence, street, action, amount, actorSeat, actor, controller }));
}
