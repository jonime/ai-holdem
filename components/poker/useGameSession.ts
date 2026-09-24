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
import { gameEnvelopeSchema, historyEnvelopeSchema } from "@/lib/http/schemas";
import { useGameChannel } from "@/lib/realtime/useGameChannel";
import { useI18n } from "@/components/poker/I18nProvider";

import type {
  AIDecision,
  AIDifficulty,
  BotDescriptor,
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botCatalog, setBotCatalog] = useState<readonly BotDescriptor[]>([]);
  const automaticallyAdvancedVersions = useRef(new Set<number>());
  const latestLoadRequest = useRef(0);
  const realtimeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const realtimeRefreshInFlight = useRef(false);
  const realtimeRefreshPending = useRef(false);
  const router = useRouter();
  const { locale, t } = useI18n();

  const loadGame = useCallback(async (targetGameId: string) => {
    const requestNumber = ++latestLoadRequest.current;
    const body = await requestJson<{ game: Game }>(
      `/api/games/${targetGameId}`,
      undefined,
      gameEnvelopeSchema,
    );
    if (requestNumber === latestLoadRequest.current) {
      setGame((current) =>
        current && current.version > body.game.version ? current : body.game,
      );
    }
    return body.game;
  }, []);

  const scheduleRealtimeRefresh = useCallback(() => {
    function schedule() {
      if (!gameId) return;
      if (realtimeRefreshInFlight.current) {
        realtimeRefreshPending.current = true;
        return;
      }
      if (realtimeRefreshTimer.current) return;

      realtimeRefreshTimer.current = setTimeout(() => {
        realtimeRefreshTimer.current = null;
        realtimeRefreshInFlight.current = true;
        void loadGame(gameId)
          .catch(() => {
            setError(t("errors.refreshGame"));
          })
          .finally(() => {
            realtimeRefreshInFlight.current = false;
            if (realtimeRefreshPending.current) {
              realtimeRefreshPending.current = false;
              schedule();
            }
          });
      }, 75);
    }

    schedule();
  }, [gameId, loadGame, t]);

  useGameChannel(gameId, game?.version ?? null, scheduleRealtimeRefresh);

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
    return () => {
      if (realtimeRefreshTimer.current) {
        clearTimeout(realtimeRefreshTimer.current);
        realtimeRefreshTimer.current = null;
      }
      realtimeRefreshPending.current = false;
    };
  }, [gameId]);

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
          setGame(currentGame);
        }
        const body = await requestJson<{ game: Game }>(
          `/api/games/${currentGame.id}/start`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedVersion: currentGame.version }),
          },
        );
        setGame(body.game);
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
    [game, t],
  );

  const updateTableSettings = useCallback(
    async (settings: TableSettings) => {
      if (!game) return;
      setLoading(true);
      setError(null);
      try {
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
        setGame(body.game);
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
    [game, t],
  );

  const advanceAiTurns = useCallback(async (nextGame: Game) => {
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
      const body = await requestJson<{ game: Game; aiDecision: AIDecision }>(
        `/api/games/${current.id}/step`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: current.version }),
        },
      );
      current = body.game;
      setGame(current);
      setLiveDecisions((previous) => [...previous, body.aiDecision]);
    }
  }, []);

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
        setGame(body.game);
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
    [advanceAiTurns, game, t],
  );

  const beginNextHand = useCallback(async () => {
    if (!game) return;
    setLoading(true);
    setError(null);
    setLiveDecisions([]);
    setSelectedHistoryHand(null);
    try {
      const body = await requestJson<{ game: Game }>(
        `/api/games/${game.id}/next-hand`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: game.version }),
        },
      );
      setGame(body.game);
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
  }, [advanceAiTurns, game, t]);

  const revealCards = useCallback(async () => {
    if (!game) return;
    setLoading(true);
    setError(null);
    try {
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
      setGame(body.game);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("errors.revealCards"),
      );
    } finally {
      setLoading(false);
    }
  }, [game, t]);

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

  return {
    botCatalog,
    game,
    history,
    historyLoading,
    selectedHistoryHand,
    liveDecisions,
    loading,
    error,
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
