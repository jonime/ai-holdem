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
import { botErrorMessage } from "./bot-error";
import { advanceBotTurns, hasBotTurn } from "./bot-advancement";
import { canAdvanceBots, tableFlow } from "@/components/poker/view-model";
import { getClientPlayerToken } from "@/lib/identity/player-token-client";
import { api } from "@/lib/http/api";
import type { HumanAction } from "@/lib/http/gameplay-contracts";
import { LLM_CREDIT_EXIT_RULE } from "@/lib/bots/types";
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

function botTurnKey(game: Game): string {
  return `${game.id}:${game.poker.handNumber}:${game.poker.currentActorId}`;
}

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
  const retryPending = useRef(false);
  const pausedBotTurn = useRef<string | null>(null);
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
    pausedBotTurn.current = null;
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
      if (reconciled.game && pausedBotTurn.current !== botTurnKey(reconciled.game)) {
        pausedBotTurn.current = null;
      }
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
        const body = await api.games.get({ gameId: targetGameId }, { signal: controller.signal });
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
    void api.bots.catalog()
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
    void api.games.history({ gameId: game.id, hand: handNumber })
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
      const body = await api.creation.custom();
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
    async (action: () => Promise<unknown>) => {
      if (!game) return false;
      setLoading(true);
      setError(null);
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

  const releaseSeat = useCallback(
    async (seat: number) => {
      if (!game) return;
      await postSeatAction(() => api.seats.release({ gameId: game.id, seat, expectedVersion: game.version }));
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

  const advanceAiTurns = useCallback(
    async (nextGame: Game) => {
      if (botLoop.current || activeGameId.current !== nextGame.id ||
          !canAdvanceBots(nextGame, getClientPlayerToken())) return;
      const loop = Symbol("bot loop");
      const eligibilityEpoch = botEligibilityEpoch.current;
      botLoop.current = loop;
      let stepSequence = 0;
      let attemptedGame = nextGame;
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
            attemptedGame = current;
            automaticallyAdvancedVersions.current.add(current.version);
            stepSequence = ++nextResponseSequence.current;
            const body = await api.games.stepBot({ gameId: current.id, expectedVersion: current.version });
            return body;
          },
          apply: body => {
            pausedBotTurn.current = null;
            applyGame(body.game, stepSequence);
            setLiveDecisions(previous => [...previous, body.aiDecision]);
            if (body.aiDecision.matchedRule === LLM_CREDIT_EXIT_RULE) {
              setError(t("errors.llmCredits", { bot: body.aiDecision.bot.label }));
            }
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
        if (isActive()) {
          pausedBotTurn.current = botTurnKey(attemptedGame);
          setError(botErrorMessage(requestError, t));
        }
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
    const current = latestGame.current;
    if (!current || retryPending.current || botLoop.current ||
        !canAdvanceBots(current, getClientPlayerToken())) return;
    retryPending.current = true;
    const eligibilityEpoch = botEligibilityEpoch.current;
    setLoading(true);
    setError(null);
    try {
      await loadGame(current.id);
      const authoritative = latestGame.current;
      if (activeGameId.current === current.id &&
          botEligibilityEpoch.current === eligibilityEpoch && authoritative) {
        await advanceAiTurns(authoritative);
      }
    } catch (requestError) {
      if (activeGameId.current === current.id) setError(botErrorMessage(requestError, t));
    } finally {
      retryPending.current = false;
      if (activeGameId.current === current.id) setLoading(false);
    }
  }, [advanceAiTurns, loadGame, t]);

  useEffect(() => {
    if (
      !game ||
      loading ||
      !canAdvanceBots(game, getClientPlayerToken()) ||
      botLoop.current !== null ||
      retryPending.current ||
      !hasBotTurn(game) ||
      pausedBotTurn.current === botTurnKey(game) ||
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
      const proposedAction: HumanAction = action.type === "bet" || action.type === "raise"
        ? { type: action.type, amount: amountOverride ?? action.minAmount }
        : action.type === "call" ? { type: "call", amount: action.amount }
        : { type: action.type };

      setLoading(true);
      setError(null);
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
    if (!game || loading || nextHandPending.current ||
      !tableFlow(game.poker.players, game.poker.street, getClientPlayerToken(), game.viewerIsHost).canStartNextHand) return;
    nextHandPending.current = true;
    setLoading(true);
    setError(null);
    setLiveDecisions([]);
    setSelectedHistoryHand(null);
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
  }, [advanceAiTurns, applyGame, game, loading, t]);

  const revealCards = useCallback(async () => {
    if (!game) return;
    setLoading(true);
    setError(null);
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
