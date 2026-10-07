"use client";

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
import { HttpError, api } from "@/lib/http/api";
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
  const router = useRouter();
  const { locale, t } = useI18n();

  useEffect(() => {
    activeGameId.current = gameId;
    return () => {
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
      const sequence = ++nextResponseSequence.current;
      const { controller, cancel } = createRefreshTimeout();
      refreshAbortControllers.current.add(controller);
      try {
        const body = await api.games.get({ gameId: targetGameId }, { signal: controller.signal });
        if (isCurrent()) applyGame(body.game, sequence, targetGameId);
        return body.game;
      } catch (failure) {
        if (failure instanceof HttpError && failure.status === 404 && isCurrent() && activeGameId.current === targetGameId) {
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

  const bots = useBotLifecycle(gameId, game, loading, {
    readGame: () => latestGame.current,
    viewerToken: getClientPlayerToken,
    step: async current => {
      const sequence = ++nextResponseSequence.current;
      const actor = current.poker.players.find(player => player.id === current.poker.currentActorId);
      const result = actor?.controller === "human" && actor.leaving
        ? await api.games.advanceDeparture({ gameId: current.id, expectedVersion: current.version })
        : await api.games.stepBot({ gameId: current.id, expectedVersion: current.version });
      return { result, sequence };
    },
    apply: applyGame,
    refresh: loadGame,
    refreshFailed: setRefreshFailed,
    clearError: () => setError(null),
    errorMessage: requestError => botErrorMessage(requestError, t),
    unfinishedMessage: () => t("errors.botTurnUnfinished"),
    creditMessage: decision => t("errors.llmCredits", { bot: decision.bot.label }),
  });
  useLayoutEffect(() => {
    botLifecycle.current = bots.lifecycle;
    return () => { botLifecycle.current = null; };
  }, [bots.lifecycle]);
  const advanceAiTurns = bots.advance;
  const retryBotTurn = bots.retry;

  const performRefresh = useCallback(async () => {
    if (!gameId || unavailableGameId.current === gameId || !navigator.onLine) return;
    setRefreshing(true);
    try {
      await loadGame(gameId);
      setRefreshFailed(false);
    } catch (requestError) {
      if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
        setRefreshFailed(true);
      } else if (activeGameId.current === gameId) {
        setRefreshFailed(true);
      }
    } finally {
      if (activeGameId.current === gameId) setRefreshing(false);
    }
  }, [gameId, loadGame]);

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

  const postSeatAction = useCallback(
    async (action: () => Promise<unknown>) => {
      if (!game) return false;
      setLoading(true);
      setError(null);
      botLifecycle.current?.clearNotice();
      try {
        await action();
        await loadGame(game.id);
        return true;
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("errors.seatUpdate"),
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [game, loadGame, t],
  );

  const claimSeatAt = useCallback(
    async (seat: number, playerName: string) => {
      const trimmedName = playerName.trim();
      window.localStorage.setItem("ai-holdem-player-name", trimmedName);
      if (!game) return false;
      return postSeatAction(() => api.seats.claim({ gameId: game.id, seat,
        ...(trimmedName ? { name: trimmedName } : {}),
        expectedVersion: game.version,
      }));
    },
    [game, postSeatAction],
  );

  const updatePlayerName = useCallback(
    async (seat: number, playerName: string) => {
      const trimmedName = playerName.trim();
      if (!game) return false;
      const updated = await postSeatAction(() => api.seats.rename({ gameId: game.id, seat, name: trimmedName }));
      if (updated) {
        window.localStorage.setItem("ai-holdem-player-name", trimmedName);
      }
      return updated;
    },
    [game, postSeatAction],
  );

  const departurePending = useRef(false);
  const releaseSeat = useCallback(
    async (seat: number, navigate = false) => {
      // Use the version presented with the control, so a seat change requires
      // explicit review/retry rather than acting on a newly occupied seat.
      const current = game;
      if (!current || departurePending.current || activeGameId.current !== current.id) return false;
      departurePending.current = true;
      setLoading(true);
      setError(null);
      try {
        await api.seats.release({ gameId: current.id, seat, expectedVersion: current.version });
        if (activeGameId.current !== current.id) return false;
        if (navigate) {
          botLifecycle.current?.reset();
          router.push(addLocalePrefix("/play", locale));
        } else await loadGame(current.id);
        return true;
      } catch (requestError) {
        if (activeGameId.current !== current.id) return false;
        if (requestError instanceof HttpError && requestError.status === 409) {
          try { await loadGame(current.id); } catch { setRefreshFailed(true); }
          setError(t("gameHeader.departureChanged"));
        } else setError(requestError instanceof Error ? requestError.message : t("errors.seatUpdate"));
        return false;
      } finally {
        departurePending.current = false;
        if (activeGameId.current === current.id) setLoading(false);
      }
    },
    [game, loadGame, locale, router, t],
  );

  const assignBot = useCallback(
    async (
      seat: number,
      difficulty: AIDifficulty,
      botId = "jev",
      botProfileId: BotPlaystyleId | null = null,
    ) => {
      if (!game) return;
      await postSeatAction(() => api.seats.assignBot({ gameId: game.id, seat,
        difficulty,
        botId,
        ...(botProfileId ? { botProfileId } : {}),
        expectedVersion: game.version,
      }));
    },
    [game, postSeatAction],
  );

  const startWaitingGame = useCallback(
    async (settings: TableSettings) => {
      if (!game) return;
      setLoading(true);
      setError(null);
      botLifecycle.current?.clearNotice();
      try {
        let currentGame = game;
        const settingsChanged =
          settings.seatCount !== currentGame.poker.seatCount ||
          settings.smallBlind !== currentGame.poker.smallBlind ||
          settings.bigBlind !== currentGame.poker.bigBlind ||
          settings.startingStack !== currentGame.poker.startingStack ||
          settings.botsShowUncontestedWins !==
            (currentGame.poker.botsShowUncontestedWins ?? false);
        if (settingsChanged) {
          const settingsSequence = ++nextResponseSequence.current;
          const settingsBody = await api.games.settings({ ...settings, gameId: currentGame.id, expectedVersion: currentGame.version });
          currentGame = settingsBody.game;
          applyGame(currentGame, settingsSequence);
        }
        const startSequence = ++nextResponseSequence.current;
        const body = await api.games.start({ gameId: currentGame.id, expectedVersion: currentGame.version });
        applyGame(body.game, startSequence);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("errors.startGame"),
        );
      } finally {
        setLoading(false);
      }
    },
    [applyGame, game, t],
  );

  const updateTableSettings = useCallback(
    async (settings: TableSettings) => {
      if (!game) return;
      setLoading(true);
      setError(null);
      botLifecycle.current?.clearNotice();
      try {
        const sequence = ++nextResponseSequence.current;
        const body = await api.games.settings({ ...settings, gameId: game.id, expectedVersion: game.version });
        applyGame(body.game, sequence);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("errors.updateSettings"),
        );
      } finally {
        setLoading(false);
      }
    },
    [applyGame, game, t],
  );

  const submitAction = useCallback(
    async (action: LegalAction, amountOverride: number | null = null) => {
      if (!game) return;
      if ((action.type === "bet" || action.type === "raise") &&
          (amountOverride === null || !Number.isSafeInteger(amountOverride) ||
           amountOverride < action.minAmount || amountOverride > action.maxAmount)) return;
      const proposedAction: HumanAction = action.type === "bet" || action.type === "raise"
        ? { type: action.type, amount: amountOverride ?? action.minAmount }
        : action.type === "call" ? { type: "call", amount: action.amount }
        : { type: action.type };

      setLoading(true);
      setError(null);
      botLifecycle.current?.clearNotice();
      try {
        const sequence = ++nextResponseSequence.current;
        const body = await api.games.submitAction({ gameId: game.id, expectedVersion: game.version, action: proposedAction });
        applyGame(body.game, sequence);
        await advanceAiTurns(body.game);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("errors.submitAction"),
        );
      } finally {
        setLoading(false);
      }
    },
    [advanceAiTurns, applyGame, game, t],
  );

  const nextHandPending = useRef(false);
  const beginNextHand = useCallback(async () => {
    if (!game || loading || bots.loading || nextHandPending.current ||
      !tableFlow(game.poker.players, game.poker.street, getClientPlayerToken(), game.viewerIsHost, game.poker.seats).canStartNextHand) return;
    nextHandPending.current = true;
    setLoading(true);
    setError(null);
    botLifecycle.current?.clearNotice();
    try {
      const sequence = ++nextResponseSequence.current;
      const body = await api.games.nextHand({ gameId: game.id, expectedVersion: game.version });
      applyGame(body.game, sequence);
      await advanceAiTurns(body.game);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("errors.nextHand"),
      );
    } finally {
      nextHandPending.current = false;
      setLoading(false);
    }
  }, [advanceAiTurns, applyGame, game, loading, bots.loading, t]);

  const revealCards = useCallback(async () => {
    if (!game) return;
    setLoading(true);
    setError(null);
    botLifecycle.current?.clearNotice();
    try {
      const sequence = ++nextResponseSequence.current;
      const body = await api.games.reveal({ gameId: game.id, expectedVersion: game.version, handNumber: game.poker.handNumber });
      applyGame(body.game, sequence);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("errors.revealCards"),
      );
    } finally {
      setLoading(false);
    }
  }, [applyGame, game, t]);

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
    botCatalog,
    unavailable,
    game,
    feed,
    feedLoading: Boolean(gameId_) && feed === null,
    loading: loading || bots.loading,
    navigationLoading: loading,
    error: unavailable ? t("errors.tableUnavailable") : error ?? bots.notice,
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
