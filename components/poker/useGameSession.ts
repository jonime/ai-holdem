"use client";
import { observeTurnClock, turnRemainingMs } from "./turn-clock";

import { addLocalePrefix } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useGameFeed } from "./useGameFeed";
import { botErrorMessage } from "./bot-error";
import { useBotLifecycle, type BotLifecycle } from "./useBotLifecycle";
import { tableFlow } from "@/components/poker/view-model";
import { getClientPlayerToken } from "@/lib/identity/player-token-client";
import { HttpError, unknownOutcome, api } from "@/lib/http/api";
import type { HumanAction } from "@/lib/http/gameplay-contracts";
import { useGameChannel } from "@/lib/realtime/useGameChannel";
import {
  RefreshCoordinator,
  connectionStatus,
  createRefreshTimeout,
  pollingInterval,
  type RefreshConnectionStatus,
} from "@/lib/realtime/refresh-coordinator";
import {
  reconcileGame,
  type AppliedGameResponse,
} from "@/lib/realtime/game-state";
import { useI18n } from "@/components/poker/I18nProvider";

import type {
  AIDifficulty,
  BotDescriptor,
  BotPlaystyleId,
  Game,
  LegalAction,
  TableSettings,
} from "@/components/poker/types";

export function useGameSession(gameId?: string) {
  const [unavailableId, setUnavailableId] = useState<string | null>(null);
  const unavailable = unavailableId === gameId;
  const unavailableGameId = useRef<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const { feed, refreshFeed } = useGameFeed(gameId);
  const [loading, setLoading] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const [botCatalog, setBotCatalog] = useState<readonly BotDescriptor[]>([]);
  const activeGameId = useRef(gameId);
  const latestGame = useRef<Game | null>(null);
  const botLifecycle = useRef<BotLifecycle | null>(null);
  const nextResponseSequence = useRef(0);
  const lastAppliedResponse = useRef<AppliedGameResponse | null>(null);
  const refreshCoordinator = useRef<RefreshCoordinator | null>(null);
  const refreshAbortControllers = useRef(new Set<AbortController>());
  const mutationPending = useRef(false);
  const recoveryBlock = useRef(false);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const sessionGeneration = useRef(0);
  const requestController = useRef(new AbortController());
  const router = useRouter();
  const { locale, t } = useI18n();

  useLayoutEffect(() => {
    const generation = ++sessionGeneration.current;
    requestController.current = new AbortController();
    mutationPending.current = false;
    recoveryBlock.current = false;
    queueMicrotask(() => {
      if (sessionGeneration.current === generation) { setRecoveryBlocked(false); setLoading(false); setError(null); setRecoveryNotice(null); }
    });
    activeGameId.current = gameId;
    return () => {
      sessionGeneration.current = generation + 1;
      requestController.current.abort();
      activeGameId.current = undefined;
      latestGame.current = null;
    };
  }, [gameId]);

  const applyGame = useCallback(
    (incoming: Game, sequence: number, targetGameId = incoming.id) => {
      if (unavailableGameId.current === targetGameId || activeGameId.current !== targetGameId || incoming.id !== targetGameId) {
        return false;
      }
      const reconciled = reconcileGame(
        latestGame.current,
        incoming,
        lastAppliedResponse.current,
        sequence,
      );
      lastAppliedResponse.current = reconciled.applied;
      if (reconciled.applied.sequence === sequence) observeTurnClock(reconciled.game);
      latestGame.current = reconciled.game;
      botLifecycle.current?.reconcile(reconciled.game);
      setGame(reconciled.game);
      if (reconciled.applied.sequence === sequence) {
        refreshFeed(reconciled.game.version);
      }
      return reconciled.applied.sequence === sequence;
    },
    [refreshFeed],
  );

  const loadGame = useCallback(
    async (targetGameId: string, isCurrent: () => boolean = () => true) => {
      const generation = sessionGeneration.current;
      const valid = () => isCurrent() && generation === sessionGeneration.current;
      const sequence = ++nextResponseSequence.current;
      const { controller, cancel } = createRefreshTimeout();
      refreshAbortControllers.current.add(controller);
      try {
        const body = await api.games.get({ gameId: targetGameId }, { signal: controller.signal });
        if (valid()) {
          applyGame(body.game, sequence, targetGameId);
          if (recoveryBlock.current && !mutationPending.current) {
            recoveryBlock.current = false; setRecoveryBlocked(false); setError(null); setRecoveryNotice(t("errors.actionReconciled"));
          }
        }
        return body.game;
      } catch (failure) {
        if (failure instanceof HttpError && failure.status === 404 && valid() && activeGameId.current === targetGameId) {
          unavailableGameId.current = targetGameId;
          latestGame.current = null;
          botLifecycle.current?.reset();
          setGame(null);
          setUnavailableId(targetGameId);
          setError(t("errors.tableUnavailable"));
        }
        throw failure;
      } finally {
        cancel();
        refreshAbortControllers.current.delete(controller);
      }
    },
    [applyGame, t],
  );

  const bots = useBotLifecycle(gameId, game, loading || recoveryBlocked, {
    readGame: () => latestGame.current,
    viewerToken: getClientPlayerToken,
    step: async current => {
      const options = { signal: requestController.current.signal };
      const sequence = ++nextResponseSequence.current;
      const actor = current.poker.players.find(player => player.id === current.poker.currentActorId);
      const result = actor?.controller === "human" && actor.leaving
        ? await api.games.advanceDeparture({ gameId: current.id, expectedVersion: current.version }, options)
        : actor?.controller === "human" && current.turnTimer
          ? await api.games.advanceTimeout({ gameId: current.id, expectedVersion: current.version, decisionId: current.turnTimer.decisionId }, options)
        : await api.games.stepBot({ gameId: current.id, expectedVersion: current.version }, options);
      return { result, sequence };
    },
    apply: applyGame,
    refresh: loadGame,
    refreshFailed: setRefreshFailed,
    clearError: () => setError(null),
    errorMessage: requestError => botErrorMessage(requestError, t),
    unfinishedMessage: () => t("errors.botTurnUnfinished"),
    unknownMessage: () => t("errors.actionUnconfirmed"),
    creditMessage: decision => t("errors.llmCredits", { bot: decision.bot.label }),
  });
  useLayoutEffect(() => {
    botLifecycle.current = bots.lifecycle;
    return () => { botLifecycle.current = null; };
  }, [bots.lifecycle]);
  const retryBotTurn = bots.retry;

  const performRefresh = useCallback(async () => {
    if (!gameId || unavailableGameId.current === gameId || !navigator.onLine) return;
    const generation = sessionGeneration.current;
    setRefreshing(true);
    try {
      await loadGame(gameId, () => sessionGeneration.current === generation);
      if (sessionGeneration.current !== generation) return;
      setRefreshFailed(false);
      if (recoveryBlock.current && !mutationPending.current) {
        recoveryBlock.current = false;
        setRecoveryBlocked(false);
        setError(null); setRecoveryNotice(t("errors.actionReconciled"));
      }
    } catch (requestError) {
      if (sessionGeneration.current !== generation) return;
      if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
        setRefreshFailed(true);
      } else if (activeGameId.current === gameId) {
        setRefreshFailed(true);
      }
    } finally {
      if (sessionGeneration.current === generation) setRefreshing(false);
    }
  }, [gameId, loadGame, t]);

  useEffect(() => {
    const coordinator = new RefreshCoordinator(performRefresh);
    const abortControllers = refreshAbortControllers.current;
    refreshCoordinator.current = coordinator;
    return () => {
      coordinator.dispose();
      if (refreshCoordinator.current === coordinator) {
        refreshCoordinator.current = null;
      }
      for (const controller of abortControllers) controller.abort();
      abortControllers.clear();
    };
  }, [gameId, performRefresh]);

  const scheduleRealtimeRefresh = useCallback(() => {
    refreshCoordinator.current?.schedule();
  }, []);

  const realtimeStatus = useGameChannel(
    unavailable ? undefined : gameId,
    game?.version ?? null,
    scheduleRealtimeRefresh,
  );

  useEffect(() => {
    refreshCoordinator.current?.pollEvery(
      pollingInterval(realtimeStatus === "subscribed", online, visible),
    );
  }, [online, realtimeStatus, visible]);

  useEffect(() => {
    if (realtimeStatus === "subscribed" && online && visible) {
      refreshCoordinator.current?.schedule(0);
    }
  }, [online, realtimeStatus, visible]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      refreshCoordinator.current?.schedule(0);
    };
    const handleOffline = () => setOnline(false);
    const handleVisibility = () => {
      const nextVisible = document.visibilityState === "visible";
      setVisible(nextVisible);
      if (nextVisible && navigator.onLine) refreshCoordinator.current?.schedule(0);
    };
    const handleFocus = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        refreshCoordinator.current?.schedule(0);
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    void api.bots.catalog()
      .then((body) => setBotCatalog(body.bots))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!gameId) {
      return;
    }

    let cancelled = false;

    void Promise.resolve().then(() => loadGame(gameId, () => !cancelled)).catch(() => {
      if (!cancelled) {
        setError(t(unavailableGameId.current === gameId ? "errors.tableUnavailable" : "errors.loadGame"));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [gameId, loadGame, t]);

  const gameId_ = game?.id;

  const createGame = useCallback(async () => {
    setLoading(true);
    setError(null);
    botLifecycle.current?.clearNotice();
    try {
      const body = await api.creation.custom();
      window.localStorage.setItem("ai-holdem-game-id", body.gameId);
      router.push(addLocalePrefix(`/game/${body.gameId}`, locale));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("errors.createGame"),
      );
    } finally {
      setLoading(false);
    }
  }, [locale, router, t]);

  // One synchronous gate covers clicks, keyboard actions and multi-request workflows.
  const mutate = useCallback(async (work: (signal: AbortSignal, current: () => boolean) => Promise<void>, conflictMessage?: string) => {
    if (!game || mutationPending.current || recoveryBlock.current || bots.loading || activeGameId.current !== game.id) return false;
    const generation = sessionGeneration.current;
    const current = () => sessionGeneration.current === generation && activeGameId.current === game.id;
    setRecoveryNotice(null);
    mutationPending.current = true;
    botLifecycle.current?.suspend(true);
    setLoading(true);
    setError(null);
    botLifecycle.current?.clearNotice();
    try {
      await work(requestController.current.signal, current);
      return current();
    } catch (failure) {
      if (!current()) return false;
      if (unknownOutcome(failure)) {
        recoveryBlock.current = true;
        setRecoveryBlocked(true);
        setError(t("errors.actionUnconfirmed"));
        try {
          await loadGame(game.id, current);
          if (current()) {
            recoveryBlock.current = false;
            setRecoveryBlocked(false);
            setError(null); setRecoveryNotice(t("errors.actionReconciled"));
          }
        } catch {
          if (current()) { setRefreshFailed(true); setError(t("errors.actionRecoveryFailed")); }
        }
      } else if (failure instanceof HttpError && (failure.status === 409 || failure.code === "TURN_EXPIRED")) {
        try { await loadGame(game.id, current); }
        catch { if (current()) setRefreshFailed(true); }
        if (current()) setError(failure.code === "TURN_EXPIRED" || failure.code === "GAME_VERSION_CONFLICT" ? null : conflictMessage ?? failure.message);
      } else setError(failure instanceof Error ? failure.message : t("errors.submitAction"));
      return false;
    } finally {
      if (current()) {
        mutationPending.current = false;
        setLoading(false);
        botLifecycle.current?.suspend(recoveryBlock.current);
      }
    }
  }, [game, bots.loading, loadGame, t]);

  const postSeatAction = useCallback((action: (signal: AbortSignal) => Promise<unknown>) => mutate(async (signal, current) => {
    await action(signal);
    if (current() && game) await loadGame(game.id, current);
  }), [game, loadGame, mutate]);

  const claimSeatAt = useCallback(async (seat: number, playerName: string) => {
    if (!game) return false;
    const name = playerName.trim();
    window.localStorage.setItem("ai-holdem-player-name", name);
    return postSeatAction(signal => api.seats.claim({ gameId: game.id, seat, ...(name ? { name } : {}), expectedVersion: game.version }, { signal }));
  }, [game, postSeatAction]);
  const updatePlayerName = useCallback(async (seat: number, playerName: string) => {
    if (!game) return false;
    const name = playerName.trim();
    const updated = await postSeatAction(signal => api.seats.rename({ gameId: game.id, seat, name }, { signal }));
    if (updated) window.localStorage.setItem("ai-holdem-player-name", name);
    return updated;
  }, [game, postSeatAction]);
  const releaseSeat = useCallback(async (seat: number, navigate = false) => mutate(async (signal, current) => {
    if (!game) return;
    await api.seats.release({ gameId: game.id, seat, expectedVersion: game.version }, { signal });
    if (!current()) return;
    if (navigate) { botLifecycle.current?.reset(); router.push(addLocalePrefix("/play", locale)); }
    else await loadGame(game.id, current);
  }, t("gameHeader.departureChanged")), [game, mutate, loadGame, router, locale, t]);
  const assignBot = useCallback(async (seat: number, difficulty: AIDifficulty, botId = "jev", botProfileId: BotPlaystyleId | null = null) => {
    if (!game) return;
    await postSeatAction(signal => api.seats.assignBot({ gameId: game.id, seat, difficulty, botId, ...(botProfileId ? { botProfileId } : {}), expectedVersion: game.version }, { signal }));
  }, [game, postSeatAction]);

  const startWaitingGame = useCallback(async (settings: TableSettings) => mutate(async (signal, current) => {
    if (!game) return;
    let state = game;
    const changed = (settings.humanTurnSeconds !== undefined && settings.humanTurnSeconds !== (state.poker.humanTurnSeconds ?? null)) ||
      settings.seatCount !== state.poker.seatCount || settings.smallBlind !== state.poker.smallBlind ||
      settings.bigBlind !== state.poker.bigBlind || settings.startingStack !== state.poker.startingStack ||
      settings.botsShowUncontestedWins !== (state.poker.botsShowUncontestedWins ?? false);
    if (changed) {
      const sequence = ++nextResponseSequence.current;
      const body = await api.games.settings({ ...settings, gameId: state.id, expectedVersion: state.version }, { signal });
      if (!current()) return;
      state = body.game;
      applyGame(state, sequence);
    }
    if (!current()) return;
    const sequence = ++nextResponseSequence.current;
    const body = await api.games.start({ gameId: state.id, expectedVersion: state.version }, { signal });
    if (current()) applyGame(body.game, sequence);
  }), [game, mutate, applyGame]);
  const updateTableSettings = useCallback(async (settings: TableSettings) => mutate(async (signal, current) => {
    if (!game) return;
    const sequence = ++nextResponseSequence.current;
    const body = await api.games.settings({ ...settings, gameId: game.id, expectedVersion: game.version }, { signal });
    if (current()) applyGame(body.game, sequence);
  }), [game, mutate, applyGame]);
  const submitAction = useCallback(async (action: LegalAction, amountOverride: number | null = null) => {
    if (!game || (turnRemainingMs(game) ?? 1) <= 0) return;
    if ((action.type === "bet" || action.type === "raise") && (amountOverride === null || !Number.isSafeInteger(amountOverride) || amountOverride < action.minAmount || amountOverride > action.maxAmount)) return;
    const proposedAction: HumanAction = action.type === "bet" || action.type === "raise" ? { type: action.type, amount: amountOverride ?? action.minAmount } : action.type === "call" ? { type: "call", amount: action.amount } : { type: action.type };
    await mutate(async (signal, current) => {
      const sequence = ++nextResponseSequence.current;
      const body = await api.games.submitAction({ gameId: game.id, expectedVersion: game.version, action: proposedAction }, { signal });
      if (current()) applyGame(body.game, sequence);
    });
  }, [game, mutate, applyGame]);
  const beginNextHand = useCallback(async () => {
    if (!game || !tableFlow(game.poker.players, game.poker.street, getClientPlayerToken(), game.viewerIsHost, game.poker.seats).canStartNextHand) return;
    await mutate(async (signal, current) => {
      const sequence = ++nextResponseSequence.current;
      const body = await api.games.nextHand({ gameId: game.id, expectedVersion: game.version }, { signal });
      if (current()) applyGame(body.game, sequence);
    });
  }, [game, mutate, applyGame]);
  const revealCards = useCallback(async () => mutate(async (signal, current) => {
    if (!game) return;
    const sequence = ++nextResponseSequence.current;
    const body = await api.games.reveal({ gameId: game.id, expectedVersion: game.version, handNumber: game.poker.handNumber }, { signal });
    if (current()) applyGame(body.game, sequence);
  }), [game, mutate, applyGame]);

  const liveConnectionStatus: RefreshConnectionStatus = connectionStatus({
    subscribed: realtimeStatus === "subscribed",
    online,
    refreshing,
    refreshFailed,
  });
  const refreshGame = useCallback(() => {
    refreshCoordinator.current?.schedule(0);
  }, []);

  return {
    online,
    botCatalog,
    unavailable,
    game,
    feed,
    feedLoading: Boolean(gameId_) && feed === null,
    loading: loading || bots.loading || recoveryBlocked,
    recoveryBlocked,
    requestBusy: loading || bots.loading,
    navigationLoading: loading,
    error: unavailable ? t("errors.tableUnavailable") : error ?? bots.notice ?? recoveryNotice,
    usageLimited: bots.usageLimited,
    usageRetryAfterMs: bots.usageRetryAfterMs,
    connectionStatus: liveConnectionStatus,
    refreshing,
    refreshGame,
    createGame,
    loadGame,
    claimSeatAt,
    updatePlayerName,
    releaseSeat,
    assignBot,
    startWaitingGame,
    updateTableSettings,
    submitAction,
    beginNextHand,
    revealCards,
    retryBotTurn,
    refreshDirectoryState: performRefresh,
  };
}
