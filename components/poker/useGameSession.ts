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
import { useGameChannel } from "@/lib/realtime/useGameChannel";

import type {
  AIDecision,
  AIDifficulty,
  Game,
  HandHistory,
  LegalAction,
  TableSettings,
} from "@/components/poker/types";

export function useGameSession(gameId?: string) {
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
  const automaticallyAdvancedVersions = useRef(new Set<number>());
  const router = useRouter();

  const loadGame = useCallback(async (targetGameId: string) => {
    const body = await requestJson<{ game: Game }>(
      `/api/games/${targetGameId}`,
    );
    setGame(body.game);
  }, []);

  useGameChannel(gameId, game?.version ?? null, () => {
    if (gameId) void loadGame(gameId);
  });

  useEffect(() => {
    if (!gameId) {
      return;
    }

    let cancelled = false;

    void fetch(`/api/games/${gameId}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Game is unavailable");
        }
        return (await response.json()) as { game: Game };
      })
      .then((body) => {
        if (!cancelled) setGame(body.game);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load the requested game.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    const handNumber = selectedHistoryHand ?? game.poker.handNumber;
    void fetch(`/api/games/${game.id}/history?hand=${handNumber}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Hand history is unavailable");
        return (await response.json()) as { history: HandHistory };
      })
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
  }, [game, selectedHistoryHand]);

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
      router.push(`/game/${body.gameId}`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create game",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

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
            : "Seat update failed",
        );
      } finally {
        setLoading(false);
      }
    },
    [game, loadGame],
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
    async (seat: number, difficulty: AIDifficulty) => {
      await postSeatAction(`/api/games/${game?.id}/seats/${seat}/assign-bot`, {
        difficulty,
      });
    },
    [game, postSeatAction],
  );

  const startWaitingGame = useCallback(async () => {
    if (!game) return;
    setLoading(true);
    setError(null);
    try {
      const body = await requestJson<{ game: Game }>(
        `/api/games/${game.id}/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: game.version }),
        },
      );
      setGame(body.game);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to start game",
      );
    } finally {
      setLoading(false);
    }
  }, [game]);

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
            : "Unable to update table settings",
        );
      } finally {
        setLoading(false);
      }
    },
    [game],
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
          player.controller === "typesafe_ai",
      );
      attempts += 1
    ) {
      const body = await requestJson<{ game: Game; aiDecision: AIDecision }>(
        `/api/games/${current.id}/step`,
        { method: "POST" },
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
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to advance TypeSafe AI",
      );
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (
      !game ||
      loading ||
      game.status !== "playing" ||
      automaticallyAdvancedVersions.current.has(game.version) ||
      !game.poker.players.some(
        (player) =>
          player.id === game.poker.currentActorId &&
          player.controller === "typesafe_ai",
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
            : "Unable to submit action",
        );
      } finally {
        setLoading(false);
      }
    },
    [advanceAiTurns, game],
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
          : "Unable to start next hand",
      );
    } finally {
      setLoading(false);
    }
  }, [advanceAiTurns, game]);

  const selectHistoryHand = useCallback((handNumber: number) => {
    setSelectedHistoryHand(handNumber);
  }, []);

  return {
    game,
    history,
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
    selectHistoryHand,
  };
}
