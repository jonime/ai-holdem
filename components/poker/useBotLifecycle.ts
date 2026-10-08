"use client";

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { turnRemainingMs } from "./turn-clock";
import { HttpError } from "@/lib/http/api";
import { LLM_CREDIT_EXIT_RULE } from "@/lib/bots/types";
import { advanceBotTurns, hasAutomaticTurn } from "./bot-advancement";
import { canAdvanceBots } from "./view-model";
import { botBusy, botCanRetry, botCanStart, botRetryAfterMs, botTurn, initialBotLifecycle,
  sameBotTurn, transitionBotLifecycle, type BotLifecycleEvent, type BotLifecycleState } from "./bot-lifecycle";
import type { AIDecision, Game } from "./types";

type StepResult = { game: Game; aiDecision?: AIDecision };
export type BotLifecycleDriver = {
  readonly readGame: () => Game | null;
  readonly viewerToken: () => string | null;
  readonly step: (game: Game) => Promise<{ result: StepResult; sequence: number }>;
  readonly apply: (game: Game, sequence: number) => boolean;
  readonly refresh: (gameId: string, isCurrent: () => boolean) => Promise<unknown>;
  readonly refreshFailed: (failed: boolean) => void;
  readonly clearError: () => void;
  readonly errorMessage: (error: unknown) => string;
  readonly unfinishedMessage: () => string;
  readonly creditMessage: (decision: AIDecision) => string;
};

/** The hook's imperative driver is also usable with fake clocks and deferred requests. */
export class BotLifecycle {
  private state: BotLifecycleState = initialBotLifecycle;
  private listeners = new Set<() => void>();
  private gameId: string | undefined;
  private generation = 0;
  private work: symbol | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private attemptedDecisions = new Set<string>();
  private attemptedVersions = new Set<number>();
  private applying = false;
  private mutationPending = false;
  suspend(pending: boolean) {
    this.mutationPending = pending;
    const game = this.driver.readGame();
    if (!pending && game) this.reconcile(game);
  }
  constructor(private driver: BotLifecycleDriver) {}
  updateDriver(driver: BotLifecycleDriver) { this.driver = driver; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private dispatch(event: BotLifecycleEvent) {
    const next = transitionBotLifecycle(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.clearTimer();
    if (next.kind === "waitingForClaim") {
      this.timer = setTimeout(() => this.tick(), Math.max(0, next.deadline - Date.now()));
    } else if (next.kind === "usageLimited" && botRetryAfterMs(next) > 0) {
      this.timer = setTimeout(() => this.tick(), 250);
    }
    for (const listener of this.listeners) listener();
  }
  private tick() {
    this.dispatch({ type: "tick", now: Date.now(), unfinishedNotice: this.driver.unfinishedMessage() });
  }
  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  reset(gameId?: string) {
    this.generation++;
    this.work = null;
    this.gameId = gameId;
    this.attemptedVersions.clear();
    this.attemptedDecisions.clear();
    if (this.timeoutTimer !== null) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = null;
    this.clearTimer();
    this.dispatch({ type: "reset" });
  }
  clearNotice = () => this.dispatch({ type: "notice", notice: null });
  private eligible(game: Game | null): game is Game {
    return !!game && game.id === this.gameId && hasAutomaticTurn(game) && canAdvanceBots(game, this.driver.viewerToken());
  }
  /** Called inside session reconciliation, before React updates or promise continuations. */
  reconcile = (game: Game) => {
    if (game.id !== this.gameId) return;
    if (this.timeoutTimer !== null) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = null;
    const wait = turnRemainingMs(game);
    if (game.turnTimer && wait !== null && !this.attemptedDecisions.has(game.turnTimer.decisionId) &&
        canAdvanceBots(game, this.driver.viewerToken())) {
      this.timeoutTimer = setTimeout(() => {
        const latest = this.driver.readGame();
        if (latest && latest.id === this.gameId) void this.advance(latest, true);
      }, wait + 25);
    }
    const eligible = this.eligible(game);
    const state = this.state;
    if (!eligible || (!this.applying && state.kind === "running" &&
        !sameBotTurn(state.turn, botTurn(game)))) {
      this.generation++;
      this.work = null;
      this.dispatch({ type: "finish" });
    }
    this.dispatch({ type: "reconcile", turn: botTurn(game), eligible, hasBotTurn: hasAutomaticTurn(game) });
    if ((state.kind === "waitingForClaim" || state.kind === "usageLimited" ||
        (state.kind === "paused" && (state.reason === "claimLost" || state.reason === "claimExpired"))) &&
        this.state.kind === "idle") this.driver.clearError();
  };
  private active(token: symbol, generation: number): boolean {
    return this.work === token && this.generation === generation && this.eligible(this.driver.readGame());
  }
  advance = async (game: Game, automatic = false): Promise<void> => {
    const latest = this.driver.readGame();
    if (this.mutationPending || this.work || !botCanStart(this.state) || !this.eligible(latest) ||
        latest.id !== game.id || latest.version !== game.version ||
        (automatic && (this.attemptedVersions.has(game.version) ||
          (game.turnTimer && this.attemptedDecisions.has(game.turnTimer.decisionId))))) return;
    const token = Symbol("bot lifecycle");
    const generation = this.generation;
    this.work = token;
    if (game.turnTimer) this.attemptedDecisions.add(game.turnTimer.decisionId);
    this.attemptedVersions.add(game.version);
    this.driver.clearError();
    this.dispatch({ type: "start", turn: botTurn(game) });
    await this.run(game, token, generation);
  };
  private async run(game: Game, token: symbol, generation: number) {
    let attempted = game;
    let sequence = 0;
    const active = () => this.active(token, generation);
    try {
      await advanceBotTurns(game, {
        viewerToken: this.driver.viewerToken, isActive: active,
        step: async current => {
          attempted = current;
          this.attemptedVersions.add(current.version);
          this.dispatch({ type: "resume", turn: botTurn(current) });
          const response = await this.driver.step(current);
          sequence = response.sequence;
          return response.result;
        },
        apply: result => {
          this.applying = true;
          let accepted: boolean;
          try { accepted = this.driver.apply(result.game, sequence); }
          finally { this.applying = false; }
          if (accepted) {
            if (result.aiDecision?.matchedRule === LLM_CREDIT_EXIT_RULE) {
              this.dispatch({ type: "notice", notice: this.driver.creditMessage(result.aiDecision) });
            }
          } else {
            this.generation++;
          }
        },
        refresh: async () => {
          if (attempted.turnTimer) this.attemptedDecisions.delete(attempted.turnTimer.decisionId);
          try {
            await this.driver.refresh(game.id, () => this.work === token && this.generation === generation);
            if (this.gameId === game.id && this.generation === generation) this.driver.refreshFailed(false);
          } catch (error) {
            if (active()) this.driver.refreshFailed(true);
            throw error;
          }
        },
      });
    } catch (error) {
      if (active()) await this.fail(error, attempted, token, generation);
    } finally {
      if (this.work === token) {
        this.work = null;
        this.dispatch({ type: "finish" });
      }
    }
  }
  private async fail(error: unknown, attempted: Game, token: symbol, generation: number) {
    const turn = botTurn(attempted);
    if (error instanceof HttpError && error.code === "TURN_NOT_EXPIRED" && error.retryAfterMs !== undefined) {
      if (attempted.turnTimer) this.attemptedDecisions.delete(attempted.turnTimer.decisionId);
      this.attemptedVersions.delete(attempted.version);
      this.timeoutTimer = setTimeout(() => {
        const latest = this.driver.readGame();
        if (latest && latest.id === this.gameId) void this.advance(latest, true);
      }, error.retryAfterMs + 25);
      return;
    }
    if (error instanceof HttpError && error.retryAfterMs !== undefined &&
        (error.code === "OWNER_AI_LIMIT" || error.code === "GAME_AI_RATE_LIMIT" || error.code === "BOT_STEP_IN_PROGRESS")) {
      if (this.driver.readGame()?.version !== attempted.version) return;
      const now = Date.now();
      const deadline = now + error.retryAfterMs;
      this.dispatch(error.code === "BOT_STEP_IN_PROGRESS"
        ? { type: "claimWait", turn, deadline }
        : { type: "usageLimit", turn, deadline, now, reason: error.code, notice: this.driver.errorMessage(error) });
    } else if (error instanceof HttpError && error.code === "BOT_STEP_CLAIM_LOST") {
      // Keep the loop guard during the refresh, including synchronous polling reconciliation.
      try { await this.driver.refresh(attempted.id, () => this.work === token && this.generation === generation); }
      catch (refreshError) {
        if (this.active(token, generation)) this.dispatch({ type: "pause", turn, reason: "claimLost", notice: this.driver.errorMessage(refreshError) });
        return;
      }
      const latest = this.driver.readGame();
      if (this.active(token, generation) && latest && latest.version === attempted.version && sameBotTurn(turn, botTurn(latest))) {
        this.dispatch({ type: "pause", turn, reason: "claimLost", notice: this.driver.unfinishedMessage() });
      }
    } else {
      this.dispatch({ type: "pause", turn, reason: "provider", notice: this.driver.errorMessage(error) });
    }
  }
  retry = async (): Promise<void> => {
    const game = this.driver.readGame();
    if (this.work || !this.eligible(game) || !botCanRetry(this.state, Date.now())) return;
    const token = Symbol("bot retry");
    const generation = this.generation;
    this.work = token;
    this.driver.clearError();
    this.dispatch({ type: "retry", turn: botTurn(game), now: Date.now() });
    try {
      await this.driver.refresh(game.id, () => this.work === token && this.generation === generation);
      const latest = this.driver.readGame();
      if (this.active(token, generation) && latest) {
        this.dispatch({ type: "resume", turn: botTurn(latest) });
        await this.run(latest, token, generation);
      }
    } catch (error) {
      if (this.active(token, generation)) {
        this.dispatch({ type: "pause", turn: botTurn(game), reason: "retryRefresh", notice: this.driver.errorMessage(error) });
      }
    } finally {
      if (this.work === token) {
        this.work = null;
        this.dispatch({ type: "finish" });
      }
    }
  };
}

export function useBotLifecycle(gameId: string | undefined, game: Game | null, mutationLoading: boolean, driver: BotLifecycleDriver) {
  const [lifecycle] = useState(() => new BotLifecycle(driver));
  useEffect(() => { lifecycle.updateDriver(driver); });
  const state = useSyncExternalStore(lifecycle.subscribe, lifecycle.getSnapshot, () => initialBotLifecycle);
  useLayoutEffect(() => {
    lifecycle.reset(gameId);
    return () => lifecycle.reset();
  }, [gameId, lifecycle]);
  useLayoutEffect(() => { lifecycle.suspend(mutationLoading); }, [mutationLoading, lifecycle]);
  useEffect(() => {
    if (game && !mutationLoading) void lifecycle.advance(game, true);
  }, [game, mutationLoading, lifecycle, state]);
  return { lifecycle, loading: botBusy(state), notice: state.notice,
    usageLimited: state.kind === "usageLimited", usageRetryAfterMs: botRetryAfterMs(state),
    retryAvailable: botCanRetry(state, state.kind === "usageLimited" ? state.now : 0), advance: lifecycle.advance, retry: lifecycle.retry };
}
