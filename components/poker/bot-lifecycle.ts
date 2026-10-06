import type { Game } from "./types";

export type BotTurn = {
  readonly gameId: string;
  readonly handNumber: number;
  readonly actorId: string | null;
  readonly version: number;
};
type Notice = { readonly notice: string | null };
export type BotLifecycleState =
  | ({ readonly kind: "idle" } & Notice)
  | ({ readonly kind: "running"; readonly turn: BotTurn } & Notice)
  | ({ readonly kind: "refreshingForRetry"; readonly turn: BotTurn } & Notice)
  | ({ readonly kind: "waitingForClaim"; readonly turn: BotTurn; readonly deadline: number; readonly reason: "claim" } & Notice)
  | ({ readonly kind: "paused"; readonly turn: BotTurn; readonly reason: "provider" | "claimLost" | "claimExpired" | "retryRefresh" } & Notice)
  | ({ readonly kind: "usageLimited"; readonly turn: BotTurn; readonly reason: "OWNER_AI_LIMIT" | "GAME_AI_RATE_LIMIT"; readonly deadline: number; readonly now: number } & Notice);

export const initialBotLifecycle: BotLifecycleState = { kind: "idle", notice: null };
export function botTurn(game: Game): BotTurn {
  return { gameId: game.id, handNumber: game.poker.handNumber,
    actorId: game.poker.currentActorId, version: game.version };
}
export function sameBotTurn(a: BotTurn, b: BotTurn): boolean {
  return a.gameId === b.gameId && a.handNumber === b.handNumber && a.actorId === b.actorId;
}
export function botBusy(state: BotLifecycleState): boolean {
  return state.kind === "running" || state.kind === "refreshingForRetry";
}
export function botRetryAfterMs(state: BotLifecycleState): number {
  return state.kind === "usageLimited" ? Math.max(0, state.deadline - state.now) : 0;
}
export function botCanStart(state: BotLifecycleState): boolean {
  return state.kind === "idle";
}
export function botCanRetry(state: BotLifecycleState, now: number): boolean {
  return !botBusy(state) && (state.kind !== "usageLimited" || now >= state.deadline);
}

export type BotLifecycleEvent =
  | { type: "reset" }
  | { type: "start"; turn: BotTurn }
  | { type: "retry"; turn: BotTurn; now: number }
  | { type: "resume"; turn: BotTurn }
  | { type: "finish" }
  | { type: "reconcile"; turn: BotTurn; eligible: boolean; hasBotTurn: boolean }
  | { type: "pause"; turn: BotTurn; reason: Extract<BotLifecycleState, { kind: "paused" }>["reason"]; notice: string }
  | { type: "claimWait"; turn: BotTurn; deadline: number }
  | { type: "usageLimit"; turn: BotTurn; deadline: number; now: number; reason: "OWNER_AI_LIMIT" | "GAME_AI_RATE_LIMIT"; notice: string }
  | { type: "tick"; now: number; unfinishedNotice: string }
  | { type: "notice"; notice: string | null };

/** Pure policy. Requests, response ordering and clocks belong to the driver. */
export function transitionBotLifecycle(state: BotLifecycleState, event: BotLifecycleEvent): BotLifecycleState {
  switch (event.type) {
    case "reset": return initialBotLifecycle;
    case "notice": return { ...state, notice: event.notice };
    case "start": return botCanStart(state) ? { kind: "running", turn: event.turn, notice: null } : state;
    case "retry": return botCanRetry(state, event.now) ? { kind: "refreshingForRetry", turn: event.turn, notice: null } : state;
    case "resume": return { kind: "running", turn: event.turn, notice: state.notice };
    case "finish": return botBusy(state) ? { kind: "idle", notice: state.notice } : state;
    case "pause": return { kind: "paused", turn: event.turn, reason: event.reason, notice: event.notice };
    case "claimWait": return { kind: "waitingForClaim", turn: event.turn, reason: "claim", deadline: event.deadline, notice: null };
    case "usageLimit": return { kind: "usageLimited", turn: event.turn, reason: event.reason, deadline: event.deadline, now: event.now, notice: event.notice };
    case "tick":
      if (state.kind === "usageLimited") return { ...state, now: event.now };
      if (state.kind === "waitingForClaim" && event.now >= state.deadline) {
        return { kind: "paused", turn: state.turn, reason: "claimExpired", notice: event.unfinishedNotice };
      }
      return state;
    case "reconcile": {
      if (state.kind === "idle" || botBusy(state)) return state;
      const versionFence = state.kind !== "paused" || state.reason === "claimExpired" || state.reason === "claimLost";
      if (!event.eligible || !event.hasBotTurn || !sameBotTurn(state.turn, event.turn) ||
          (versionFence && state.turn.version !== event.turn.version)) {
        return { kind: "idle", notice: versionFence ? null : state.notice };
      }
      return state;
    }
  }
}
