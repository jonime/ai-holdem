"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { requestJson } from "@/lib/http/request-json";
import {
  gameEnvelopeSchema,
  gameFeedEnvelopeSchema,
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
  Game,
  GameFeed,
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
  const [feed, setFeed] = useState<GameFeed | null>(null);
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
  const nextResponseSequence = useRef(0);
  const lastAppliedResponse = useRef<AppliedGameResponse | null>(null);
  const refreshCoordinator = useRef<RefreshCoordinator | null>(null);
  const refreshAbortControllers = useRef(new Set<AbortController>());
  const router = useRouter();
  const { locale, t } = useI18n();

  useEffect(() => {
    activeGameId.current = gameId;
  }, [gameId]);

  const applyGame = useCallback(
    (incoming: Game, sequence: number, targetGameId = incoming.id) => {
      if (activeGameId.current !== targetGameId || incoming.id !== targetGameId) {
        return;
      }
      setGame((current) => {
        const reconciled = reconcileGame(
          current,
          incoming,
          lastAppliedResponse.current,
          sequence,
        );
        lastAppliedResponse.current = reconciled.applied;
        return reconciled.game;
      });
    },
    [],
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
  const gameVersion = game?.version;
  useEffect(() => {
    if (!gameId_) {
      return;
    }
    let cancelled = false;
    void requestJson<{ feed: GameFeed }>(
      `/api/games/${gameId_}/feed`,
      undefined,
      gameFeedEnvelopeSchema,
    )
      .then((body) => {
        if (!cancelled) setFeed(body.feed);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [gameId_, gameVersion]);

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
    async (path: string, body?: unknown) => {
      if (!game) return;
      setLoading(true);
      setError(null);
      try {
        await requestJson(
          path,
          body === undefined
            ? { method: "POST" }
            : {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              },
        );
        await loadGame(game.id);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("errors.seatUpdate"),
        );
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
      await postSeatAction(`/api/games/${game?.id}/seats/${seat}/claim`, {
        ...(trimmedName ? { name: trimmedName } : {}),
      });
    },
    [game, postSeatAction],
  );

  const releaseSeat = useCallback(
    async (seat: number) => {
      await postSeatAction(`/api/games/${game?.id}/seats/${seat}/release`);
    },
    [game, postSeatAction],
  );

  const assignBot = useCallback(
    async (seat: number, difficulty: AIDifficulty, botId = "jev") => {
      await postSeatAction(`/api/games/${game?.id}/seats/${seat}/assign-bot`, {
        difficulty,
        botId,
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
      let current = nextGame;
      for (
        let attempts = 0;
        attempts < 12 &&
        current.status === "playing" &&
        current.poker.players.some(
          (player) =>
            player.id === current.poker.currentActorId &&
            player.controller === "bot",
        );
        attempts += 1
      ) {
        const sequence = ++nextResponseSequence.current;
        const body = await requestJson<{ game: Game; aiDecision: AIDecision }>(
          `/api/games/${current.id}/step`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedVersion: current.version }),
          },
        );
        current = body.game;
        applyGame(current, sequence);
        setLiveDecisions((previous) => [...previous, body.aiDecision]);
      }
    },
    [applyGame],
  );

  const automaticallyAdvanceAiTurn = useEffectEvent(async (nextGame: Game) => {
    setLoading(true);
    setError(null);
    try {
      await advanceAiTurns(nextGame);
    } catch (requestError) {
      if (
        requestError instanceof Error &&
        requestError.message === "Game version conflict" &&
        gameId
      ) {
        await loadGame(gameId).catch(() => undefined);
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("errors.advanceAi"),
      );
    } finally {
      setLoading(false);
    }
  });

  const retryBotTurn = useCallback(async () => {
    if (!game) return;
    setLoading(true);
    setError(null);
    try {
      await advanceAiTurns(game);
    } catch (requestError) {
      if (
        requestError instanceof Error &&
        requestError.message === "Game version conflict"
      ) {
        await loadGame(game.id);
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("errors.advanceAi"),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [advanceAiTurns, game, loadGame, t]);

  useEffect(() => {
    if (
      !game ||
      loading ||
      game.status !== "playing" ||
      automaticallyAdvancedVersions.current.has(game.version) ||
      !game.poker.players.some(
        (player) =>
          player.id === game.poker.currentActorId &&
          player.controller === "bot",
      )
    ) {
      return;
    }

    automaticallyAdvancedVersions.current.add(game.version);
    void automaticallyAdvanceAiTurn(game);
  }, [game, loading]);

  const submitAction = useCallback(
    async (action: LegalAction, amountOverride: number | null = null) => {
      if (!game) return;
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

  const beginNextHand = useCallback(async () => {
    if (!game) return;
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
      setLoading(false);
    }
  }, [advanceAiTurns, applyGame, game, t]);

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
    releaseSeat,
    assignBot,
    startWaitingGame,
    updateTableSettings,
    submitAction,
    beginNextHand,
    revealCards,
    retryBotTurn,
    selectHistoryHand,
  };
}
