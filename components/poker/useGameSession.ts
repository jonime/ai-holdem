"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { useGameFeed } from "./useGameFeed";
import { advanceBotTurns, hasBotTurn } from "./bot-advancement";
import { canAdvanceBots, tableFlow } from "@/components/poker/view-model";
import { getClientPlayerToken } from "@/lib/identity/player-token-client";
import { requestJson } from "@/lib/http/request-json";
import {
  gameEnvelopeSchema,
  historyEnvelopeSchema,
} from "@/lib/http/schemas";
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
  AIDecision,
  AIDifficulty,
  BotDescriptor,
  BotPlaystyleId,
  Game,
  HandHistory,
  LegalAction,
  TableSettings,
} from "@/components/poker/types";

export function useGameSession(gameId?: string, historyOpen = false) {
  const [game, setGame] = useState<Game | null>(null);
  const [liveDecisions, setLiveDecisions] = useState<readonly AIDecision[]>([]);
  const [history, setHistory] = useState<{
    readonly handNumber: number;
    readonly value: HandHistory;
  } | null>(null);
  const [selectedHistoryHand, setSelectedHistoryHand] = useState<number | null>(
    null,
  );
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
  const automaticallyAdvancedVersions = useRef(new Set<number>());
  const activeGameId = useRef(gameId);
  const latestGame = useRef<Game | null>(null);
  const botLoop = useRef<symbol | null>(null);
  const botEligibilityEpoch = useRef(0);
  const nextResponseSequence = useRef(0);
  const lastAppliedResponse = useRef<AppliedGameResponse | null>(null);
  const refreshCoordinator = useRef<RefreshCoordinator | null>(null);
  const refreshAbortControllers = useRef(new Set<AbortController>());
  const router = useRouter();
  const { locale, t } = useI18n();

  useEffect(() => {
    activeGameId.current = gameId;
    automaticallyAdvancedVersions.current.clear();
    return () => {
      activeGameId.current = undefined;
      botLoop.current = null;
      latestGame.current = null;
    };
  }, [gameId]);

  const applyGame = useCallback(
    (incoming: Game, sequence: number, targetGameId = incoming.id) => {
      if (activeGameId.current !== targetGameId || incoming.id !== targetGameId) {
        return;
      }
      const reconciled = reconcileGame(
        latestGame.current,
        incoming,
        lastAppliedResponse.current,
        sequence,
      );
      lastAppliedResponse.current = reconciled.applied;
      latestGame.current = reconciled.game;
      if (reconciled.game && !canAdvanceBots(reconciled.game, getClientPlayerToken())) {
        botEligibilityEpoch.current++;
      }
      setGame(reconciled.game);
      if (reconciled.applied.sequence === sequence) {
        refreshFeed(reconciled.game.version);
      }
    },
    [refreshFeed],
  );

  const loadGame = useCallback(
    async (targetGameId: string) => {
      const sequence = ++nextResponseSequence.current;
      const { controller, cancel } = createRefreshTimeout();
      refreshAbortControllers.current.add(controller);
      try {
        const body = await requestJson<{ game: Game }>(
          `/api/games/${targetGameId}`,
          { cache: "no-store", signal: controller.signal },
          gameEnvelopeSchema,
        );
        applyGame(body.game, sequence, targetGameId);
        return body.game;
      } finally {
        cancel();
        refreshAbortControllers.current.delete(controller);
      }
    },
    [applyGame],
  );

  const performRefresh = useCallback(async () => {
    if (!gameId || !navigator.onLine) return;
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
    gameId,
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
    void requestJson<{ bots: readonly BotDescriptor[] }>("/api/bots")
      .then((body) => setBotCatalog(body.bots))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!gameId) {
      return;
    }

    let cancelled = false;

    void loadGame(gameId).catch(() => {
      if (!cancelled) {
        setError(t("errors.loadGame"));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [gameId, loadGame, t]);

  useEffect(() => {
    if (!game || !historyOpen) {
      return;
    }
    let cancelled = false;
    const handNumber = selectedHistoryHand ?? game.poker.handNumber;
    void requestJson<{ history: HandHistory }>(
      `/api/games/${game.id}/history?hand=${handNumber}`,
      undefined,
      historyEnvelopeSchema,
    )
      .then((body) => {
        if (!cancelled)
          setHistory({
            handNumber,
            value: body.history,
          });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [game, historyOpen, selectedHistoryHand]);

  const gameId_ = game?.id;

  const createGame = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLiveDecisions([]);
    setSelectedHistoryHand(null);
    try {
      const body = await requestJson<{ gameId: string }>("/api/games", {
        method: "POST",
      });
      window.localStorage.setItem("ai-holdem-game-id", body.gameId);
      router.push(`/${locale}/game/${body.gameId}`);
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
    async (path: string, body?: unknown, method = "POST") => {
      if (!game) return false;
      setLoading(true);
      setError(null);
      try {
        await requestJson(
          path,
          body === undefined
            ? { method }
            : {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              },
        );
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
      return postSeatAction(`/api/games/${game?.id}/seats/${seat}/claim`, {
        ...(trimmedName ? { name: trimmedName } : {}),
        expectedVersion: game?.version,
      });
    },
    [game, postSeatAction],
  );

  const updatePlayerName = useCallback(
    async (seat: number, playerName: string) => {
      const trimmedName = playerName.trim();
      const updated = await postSeatAction(
        `/api/games/${game?.id}/seats/${seat}/name`,
        { name: trimmedName },
        "PATCH",
      );
      if (updated) {
        window.localStorage.setItem("ai-holdem-player-name", trimmedName);
      }
      return updated;
    },
    [game, postSeatAction],
  );

  const releaseSeat = useCallback(
    async (seat: number) => {
      await postSeatAction(`/api/games/${game?.id}/seats/${seat}/release`, { expectedVersion: game?.version });
    },
    [game, postSeatAction],
  );

  const assignBot = useCallback(
    async (
      seat: number,
      difficulty: AIDifficulty,
      botId = "jev",
      botProfileId: BotPlaystyleId | null = null,
    ) => {
      await postSeatAction(`/api/games/${game?.id}/seats/${seat}/assign-bot`, {
        difficulty,
        botId,
        ...(botProfileId ? { botProfileId } : {}),
        expectedVersion: game?.version,
      });
    },
    [game, postSeatAction],
  );

  const startWaitingGame = useCallback(
    async (settings: TableSettings) => {
      if (!game) return;
      setLoading(true);
      setError(null);
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
          const settingsBody = await requestJson<{ game: Game }>(
            `/api/games/${currentGame.id}/settings`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...settings,
                expectedVersion: currentGame.version,
              }),
            },
          );
          currentGame = settingsBody.game;
          applyGame(currentGame, settingsSequence);
        }
        const startSequence = ++nextResponseSequence.current;
        const body = await requestJson<{ game: Game }>(
          `/api/games/${currentGame.id}/start`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedVersion: currentGame.version }),
          },
        );
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
      try {
        const sequence = ++nextResponseSequence.current;
        const body = await requestJson<{ game: Game }>(
          `/api/games/${game.id}/settings`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...settings,
              expectedVersion: game.version,
            }),
          },
        );
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

  const advanceAiTurns = useCallback(
    async (nextGame: Game) => {
      if (botLoop.current || activeGameId.current !== nextGame.id ||
          !canAdvanceBots(nextGame, getClientPlayerToken())) return;
      const loop = Symbol("bot loop");
      const eligibilityEpoch = botEligibilityEpoch.current;
      botLoop.current = loop;
      let stepSequence = 0;
      const isActive = () => botLoop.current === loop &&
        botEligibilityEpoch.current === eligibilityEpoch &&
        activeGameId.current === nextGame.id &&
        hasBotTurn(latestGame.current ?? nextGame) &&
        canAdvanceBots(latestGame.current ?? nextGame, getClientPlayerToken());
      try {
        await advanceBotTurns(nextGame, {
          viewerToken: getClientPlayerToken,
          isActive,
          step: async current => {
            stepSequence = ++nextResponseSequence.current;
            const body = await requestJson<{ game: Game; aiDecision: AIDecision }>(
              `/api/games/${current.id}/step`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expectedVersion: current.version }),
              },
            );
            return body;
          },
          apply: body => {
            applyGame(body.game, stepSequence);
            setLiveDecisions(previous => [...previous, body.aiDecision]);
          },
          refresh: async () => {
            try {
              await loadGame(nextGame.id);
              if (activeGameId.current === nextGame.id) setRefreshFailed(false);
            } catch (refreshError) {
              if (isActive()) setRefreshFailed(true);
              throw refreshError;
            }
          },
        });
      } catch (requestError) {
        if (isActive()) setError(requestError instanceof Error
          ? requestError.message : t("errors.advanceAi"));
      } finally {
        if (botLoop.current === loop) botLoop.current = null;
      }
    },
    [applyGame, loadGame, t],
  );

  const automaticallyAdvanceAiTurn = useEffectEvent(async (nextGame: Game) => {
    setLoading(true);
    setError(null);
    try {
      await advanceAiTurns(nextGame);
    } finally {
      if (activeGameId.current === nextGame.id) setLoading(false);
    }
  });

  const retryBotTurn = useCallback(async () => {
    if (!game || botLoop.current || !canAdvanceBots(game, getClientPlayerToken())) return;
    setLoading(true);
    setError(null);
    try {
      await advanceAiTurns(game);
    } finally {
      if (activeGameId.current === game.id) setLoading(false);
    }
  }, [advanceAiTurns, game]);

  useEffect(() => {
    if (
      !game ||
      loading ||
      !canAdvanceBots(game, getClientPlayerToken()) ||
      botLoop.current !== null ||
      !hasBotTurn(game) ||
      automaticallyAdvancedVersions.current.has(game.version)
    ) {
      return;
    }

    automaticallyAdvancedVersions.current.add(game.version);
    void automaticallyAdvanceAiTurn(game);
  }, [game, loading]);

  const submitAction = useCallback(
    async (action: LegalAction, amountOverride: number | null = null) => {
      if (!game) return;
      if ((action.type === "bet" || action.type === "raise") &&
          (amountOverride === null || !Number.isSafeInteger(amountOverride) ||
           amountOverride < action.minAmount || amountOverride > action.maxAmount)) return;
      const selectedAmount =
        action.type === "bet" || action.type === "raise"
          ? (amountOverride ?? action.minAmount)
          : "amount" in action
            ? action.amount
            : undefined;

      setLoading(true);
      setError(null);
      try {
        const sequence = ++nextResponseSequence.current;
        const body = await requestJson<{ game: Game }>(
          `/api/games/${game.id}/action`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: {
                type: action.type,
                ...(selectedAmount !== undefined
                  ? { amount: selectedAmount }
                  : {}),
              },
              expectedVersion: game.version,
            }),
          },
        );
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
    if (!game || loading || nextHandPending.current ||
      !tableFlow(game.poker.players, game.poker.street, getClientPlayerToken(), game.viewerIsHost).canStartNextHand) return;
    nextHandPending.current = true;
    setLoading(true);
    setError(null);
    setLiveDecisions([]);
    setSelectedHistoryHand(null);
    try {
      const sequence = ++nextResponseSequence.current;
      const body = await requestJson<{ game: Game }>(
        `/api/games/${game.id}/next-hand`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: game.version }),
        },
      );
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
  }, [advanceAiTurns, applyGame, game, loading, t]);

  const revealCards = useCallback(async () => {
    if (!game) return;
    setLoading(true);
    setError(null);
    try {
      const sequence = ++nextResponseSequence.current;
      const body = await requestJson<{ game: Game }>(
        `/api/games/${game.id}/reveal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: game.version,
            handNumber: game.poker.handNumber,
          }),
        },
        gameEnvelopeSchema,
      );
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

  const selectHistoryHand = useCallback((handNumber: number) => {
    setSelectedHistoryHand(handNumber);
  }, []);

  const requestedHistoryHand = game
    ? (selectedHistoryHand ?? game.poker.handNumber)
    : null;
  const historyLoading =
    historyOpen &&
    requestedHistoryHand !== null &&
    history?.handNumber !== requestedHistoryHand;
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
    game,
    history,
    historyLoading,
    feed,
    feedLoading: Boolean(gameId_) && feed === null,
    selectedHistoryHand,
    liveDecisions,
    loading,
    error,
    connectionStatus: liveConnectionStatus,
    refreshing,
    refreshGame,
    setSelectedHistoryHand,
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
    selectHistoryHand,
    refreshDirectoryState: performRefresh,
  };
}
