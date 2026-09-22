"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { AppHeader } from "@/components/poker/AppHeader";
import { useGameChannel } from "@/lib/realtime/useGameChannel";

type LegalAction =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call"; amount: number }
  | { type: "bet"; minAmount: number; maxAmount: number }
  | { type: "raise"; minAmount: number; maxAmount: number };

interface Player {
  readonly id: string;
  readonly name: string;
  readonly controller: "human" | "typesafe_ai";
  readonly seat: number;
  readonly playerToken: string | null;
  readonly stack: number;
  readonly folded: boolean;
  readonly allIn: boolean;
  readonly holeCards: readonly string[] | null;
  readonly status: "open" | "claimed" | "bot";
  readonly isHost: boolean;
  readonly leaving: boolean;
  readonly inHand: boolean;
}

interface PokerGame {
  readonly handNumber: number;
  readonly street: "preflop" | "flop" | "turn" | "river" | "complete" | null;
  readonly currentActorId: string | null;
  readonly communityCards: readonly string[];
  readonly pot: number;
  readonly completionReason: "fold" | "showdown" | null;
  readonly winnerIds: readonly string[];
  readonly legalActions: readonly LegalAction[];
  readonly players: readonly Player[];
  readonly seatCount: number;
}

interface Game {
  readonly id: string;
  readonly status: "waiting" | "playing" | "complete" | "error";
  readonly version: number;
  readonly poker: PokerGame;
}

interface AIDecision {
  readonly action: string;
  readonly amount: number | null;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number;
  readonly sizing: {
    readonly choice: string;
    readonly probabilities: Readonly<Record<string, number>>;
    readonly confidence: number;
  } | null;
}

interface HandActionHistoryItem {
  readonly sequence: number;
  readonly street: string;
  readonly action: string;
  readonly amount: number | null;
  readonly player: string;
  readonly controller: "human" | "typesafe_ai";
}

interface CompletedAIDecisionInspection {
  readonly actionSequence: number;
  readonly state: unknown;
  readonly legalActions: unknown;
  readonly choice: string;
  readonly probabilities: unknown;
  readonly confidence: number;
  readonly rawResponse: unknown;
}

interface HandHistory {
  readonly status: "playing" | "complete" | "error";
  readonly actions: readonly HandActionHistoryItem[];
  readonly aiDecisions: readonly CompletedAIDecisionInspection[];
}

const gameStorageKey = "ai-holdem-game-id";
const playerNameStorageKey = "ai-holdem-player-name";

function formatChips(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function cardLabel(card: string): string {
  const suit = card.at(-1) ?? "";
  const rank = card.slice(0, -1);
  const suits: Record<string, string> = {
    c: "clubs",
    d: "diamonds",
    h: "hearts",
    s: "spades",
  };
  return `${rank} of ${suits[suit] ?? "unknown suit"}`;
}

function PlayingCard({
  card,
  hidden = false,
}: {
  readonly card?: string;
  readonly hidden?: boolean;
}) {
  if (hidden) {
    return (
      <span className="playing-card card-back" aria-label="Hidden card">
        TS
      </span>
    );
  }
  if (!card) {
    return <span className="playing-card empty-card" aria-hidden="true" />;
  }

  const rank = card.slice(0, -1);
  const suit = card.at(-1) ?? "";
  const suitSymbol: Record<string, string> = { c: "♣", d: "♦", h: "♥", s: "♠" };
  const red = suit === "d" || suit === "h";
  return (
    <span
      className={`playing-card ${red ? "red-card" : ""}`}
      aria-label={cardLabel(card)}
    >
      {rank}
      {suitSymbol[suit]}
    </span>
  );
}

function arrangeSeats(
  players: readonly Player[],
  anchorId: string | null,
): { readonly top: readonly Player[]; readonly bottom: readonly Player[] } {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const anchorIndex = ordered.findIndex((player) => player.id === anchorId);
  const rotated =
    anchorIndex > 0
      ? [...ordered.slice(anchorIndex), ...ordered.slice(0, anchorIndex)]
      : ordered;

  if (rotated.length >= 5) {
    return {
      bottom: [rotated[rotated.length - 1], rotated[0], rotated[1]],
      top: rotated.slice(2, rotated.length - 1).reverse(),
    };
  }

  return { bottom: rotated.slice(0, 1), top: rotated.slice(1).reverse() };
}

function Seat({
  player,
  active,
}: {
  readonly player: Player;
  readonly active: boolean;
}) {
  const isAi = player.controller === "typesafe_ai";
  const isOpen = player.status === "open";

  if (isOpen) {
    return (
      <section className="seat open-seat">
        <div className="seat-heading">
          <span className="seat-label">SEAT {player.seat + 1}</span>
        </div>
        <span className="seat-status">Open seat</span>
      </section>
    );
  }

  return (
    <section
      className={`seat ${isAi ? "ai-seat" : "human-seat"} ${active ? "active-seat" : ""}`}
    >
      <div className="seat-heading">
        <span className="seat-label">{player.name.toUpperCase()}</span>
        {active ? (
          <span className="turn-dot" aria-label="Current turn" />
        ) : null}
      </div>
      <strong>{formatChips(player.stack)}</strong>
      <div className="hole-cards">
        {player.holeCards ? (
          player.holeCards.map((card) => <PlayingCard key={card} card={card} />)
        ) : (
          <>
            <PlayingCard hidden />
            <PlayingCard hidden />
          </>
        )}
      </div>
      <span className="seat-status">
        {player.leaving
          ? "Leaving after this hand"
          : !player.inHand
            ? "Waiting for next hand"
            : player.folded
              ? "Folded"
              : player.allIn
                ? "All-in"
                : active
                  ? "Thinking"
                  : "In hand"}
      </span>
    </section>
  );
}

function parseProbabilities(value: unknown): Readonly<Record<string, number>> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

function DecisionSummary({
  probabilities,
  confidence,
}: {
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number;
}) {
  return (
    <div className="decision-summary">
      <div className="probability-list compact">
        {Object.entries(probabilities).map(([choice, probability]) => (
          <div className="probability" key={choice}>
            <span>{choice}</span>
            <div className="probability-track">
              <i style={{ width: `${probability * 100}%` }} />
            </div>
            <b>{Math.round(probability * 100)}%</b>
          </div>
        ))}
      </div>
      <span className="confidence-chip">
        Confidence {Math.round(confidence * 100)}%
      </span>
    </div>
  );
}

function ActionHistory({
  history,
  handNumber,
  availableHands,
  onSelectHand,
  liveDecisions,
}: {
  readonly history: HandHistory | null;
  readonly handNumber: number;
  readonly availableHands: readonly number[];
  readonly onSelectHand: (handNumber: number) => void;
  readonly liveDecisions: readonly AIDecision[];
}) {
  if (!history) {
    return (
      <section className="history-panel muted-panel">
        <p>Hand history loads with the table.</p>
      </section>
    );
  }

  const aiActionSequences = history.actions
    .filter((action) => action.controller === "typesafe_ai")
    .map((action) => action.sequence);
  const liveDecisionBySequence = new Map(
    aiActionSequences.map((sequence, index) => [
      sequence,
      liveDecisions[index],
    ]),
  );

  return (
    <section className="history-panel">
      <div className="panel-kicker">PERSISTED HAND</div>
      <h2>Action History</h2>
      <div className="hand-selector" aria-label="Select hand history">
        {availableHands.map((availableHand) => (
          <button
            className={availableHand === handNumber ? "selected-hand" : ""}
            key={availableHand}
            onClick={() => onSelectHand(availableHand)}
          >
            Hand {availableHand}
          </button>
        ))}
      </div>
      {history.actions.length === 0 ? (
        <p className="empty-history">No actions yet.</p>
      ) : (
        <ol className="history-list">
          {history.actions.map((action) => {
            const inspection =
              action.controller === "typesafe_ai"
                ? history.aiDecisions.find(
                    (decision) => decision.actionSequence === action.sequence,
                  )
                : undefined;
            const liveDecision =
              action.controller === "typesafe_ai" && !inspection
                ? liveDecisionBySequence.get(action.sequence)
                : undefined;
            const actionLabel = `${action.action}${action.amount !== null ? ` ${formatChips(action.amount)}` : ""}`;

            return (
              <li
                key={action.sequence}
                className={
                  action.controller === "typesafe_ai" ? "ai-history" : ""
                }
              >
                <span>{action.player}</span>
                <b>{actionLabel}</b>
                <small>{action.street}</small>
                {inspection ? (
                  <>
                    <DecisionSummary
                      probabilities={parseProbabilities(
                        inspection.probabilities,
                      )}
                      confidence={inspection.confidence}
                    />
                    <details className="history-inspection">
                      <summary>Raw decision data</summary>
                      <div className="inspection-entry">
                        <pre>
                          {JSON.stringify(
                            {
                              state: inspection.state,
                              legalActions: inspection.legalActions,
                              probabilities: inspection.probabilities,
                              rawResponse: inspection.rawResponse,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </div>
                    </details>
                  </>
                ) : liveDecision ? (
                  <DecisionSummary
                    probabilities={parseProbabilities(
                      liveDecision.probabilities,
                    )}
                    confidence={liveDecision.confidence}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function getClientPlayerToken(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cookie = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("ai-holdem-player-id="));

  if (!cookie) {
    return null;
  }

  return (
    decodeURIComponent(cookie.slice("ai-holdem-player-id=".length)) || null
  );
}

export default function PokerApp({ gameId }: { readonly gameId?: string }) {
  const [game, setGame] = useState<Game | null>(null);
  const [liveDecisions, setLiveDecisions] = useState<readonly AIDecision[]>([]);
  const [history, setHistory] = useState<{
    readonly handNumber: number;
    readonly value: HandHistory;
  } | null>(null);
  const [selectedHistoryHand, setSelectedHistoryHand] = useState<number | null>(
    null,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const automaticallyAdvancedVersions = useRef(new Set<number>());
  const [playerName, setPlayerName] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem(playerNameStorageKey) ?? ""),
  );
  const router = useRouter();

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
          ? body.error
          : "Request failed";
      throw new Error(message);
    }
    return body as T;
  }

  async function loadGame(gameId: string) {
    const body = await requestJson<{ game: Game }>(`/api/games/${gameId}`);
    setGame(body.game);
  }

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

  async function createGame() {
    setLoading(true);
    setError(null);
    setLiveDecisions([]);
    setSelectedHistoryHand(null);
    try {
      const body = await requestJson<{ gameId: string }>("/api/games", {
        method: "POST",
      });
      window.localStorage.setItem(gameStorageKey, body.gameId);
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
  }

  async function postSeatAction(path: string, body?: unknown) {
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
  }

  async function claimSeatAt(seat: number) {
    const trimmedName = playerName.trim();
    window.localStorage.setItem(playerNameStorageKey, trimmedName);
    await postSeatAction(`/api/games/${game?.id}/seats/${seat}/claim`, {
      ...(trimmedName ? { name: trimmedName } : {}),
    });
  }

  async function claimFirstOpenSeat() {
    const openSeat = game?.poker.players.find(
      (player) => player.status === "open",
    );
    if (openSeat) {
      await claimSeatAt(openSeat.seat);
    }
  }

  async function startWaitingGame() {
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
  }

  async function updateSeatCount(nextSeatCount: number) {
    if (!game) return;
    setLoading(true);
    setError(null);
    try {
      const body = await requestJson<{ game: Game }>(
        `/api/games/${game.id}/seat-count`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seatCount: nextSeatCount,
            expectedVersion: game.version,
          }),
        },
      );
      setGame(body.game);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update seat count",
      );
    } finally {
      setLoading(false);
    }
  }

  async function advanceAiTurns(nextGame: Game) {
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
  }

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

  async function submitAction(action: LegalAction) {
    if (!game) return;
    const selectedAmount =
      action.type === "bet" || action.type === "raise"
        ? (amount ?? action.minAmount)
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
  }

  async function beginNextHand() {
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
  }

  const viewerToken = getClientPlayerToken();
  const viewerPlayer =
    game?.poker.players.find(
      (player) =>
        player.playerToken !== null && player.playerToken === viewerToken,
    ) ?? null;
  const human =
    viewerPlayer && viewerPlayer.controller === "human"
      ? viewerPlayer
      : (game?.poker.players.find((player) => player.controller === "human") ??
        null);
  const currentActor = game?.poker.players.find(
    (player) => player.id === game.poker.currentActorId,
  );
  const sizedAction = game?.poker.legalActions.find(
    (action) => action.type === "bet" || action.type === "raise",
  );
  const isHumanTurn =
    viewerPlayer !== null &&
    viewerPlayer.controller === "human" &&
    game?.poker.currentActorId === viewerPlayer.id;
  const isSpectator = viewerPlayer === null && Boolean(game);
  const seatRows = arrangeSeats(
    game?.poker.players ?? [],
    (viewerPlayer ?? human)?.id ?? null,
  );
  const displayedHistoryHand = selectedHistoryHand ?? game?.poker.handNumber;
  const currentHistory =
    history && history.handNumber === displayedHistoryHand
      ? history.value
      : null;
  const availableHistoryHands = game
    ? Array.from({ length: game.poker.handNumber }, (_, index) => index + 1)
    : [];
  const winnerNames = game?.poker.winnerIds
    .map(
      (winnerId) =>
        game.poker.players.find((player) => player.id === winnerId)?.name,
    )
    .filter((name): name is string => Boolean(name));
  const handResult =
    game?.poker.street === "complete"
      ? winnerNames && winnerNames.length > 1
        ? `Split pot: ${winnerNames.join(" & ")}`
        : winnerNames?.[0]
          ? `Winner: ${winnerNames[0]}`
          : "Hand complete"
      : null;

  return (
    <main className="poker-app">
      <AppHeader loading={loading} onNewGame={() => void createGame()} />
      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}
      {!game ? (
        <div className="route-loading" aria-label="Loading table" />
      ) : game.status === "waiting" ? (
        <section className="lobby-panel">
          <div className="panel-kicker">WAITING ROOM</div>
          <h2>Choose your table</h2>
          <p>Fill at least two seats, then start the hand.</p>
          <label className="player-name-field">
            Your name
            <input
              type="text"
              value={playerName}
              maxLength={30}
              placeholder="Anonymous"
              onChange={(event) => setPlayerName(event.target.value)}
            />
          </label>
          {(() => {
            const isHost = game.poker.players.some(
              (player) => player.isHost && player.playerToken === viewerToken,
            );
            const hasHost = game.poker.players.some((player) => player.isHost);
            if (!isHost && hasHost) return null;
            return (
              <label className="seat-count-picker">
                Seats
                <select
                  value={game.poker.seatCount}
                  disabled={loading}
                  onChange={(event) =>
                    void updateSeatCount(Number(event.target.value))
                  }
                >
                  {[2, 3, 4, 5, 6].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
            );
          })()}
          <div className="lobby-seats">
            {Array.from({ length: game.poker.seatCount }, (_, seat) => {
              const player = game.poker.players.find(
                (entry) => entry.seat === seat,
              );
              const canManage =
                !game.poker.players.some((entry) => entry.isHost) ||
                game.poker.players.some(
                  (entry) => entry.isHost && entry.playerToken === viewerToken,
                );
              return (
                <article
                  className={`lobby-seat ${player?.status ?? "open"}`}
                  key={seat}
                >
                  <span className="seat-label">SEAT {seat + 1}</span>
                  <strong>{player?.name ?? "Open seat"}</strong>
                  <span>
                    {player?.status === "bot"
                      ? "TypeSafe AI"
                      : player?.status === "claimed"
                        ? "Human"
                        : "Available"}
                  </span>
                  {player?.status === "open" ? (
                    <div className="lobby-actions">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void claimSeatAt(seat)}
                      >
                        Sit here
                      </button>
                      {canManage ? (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() =>
                            void postSeatAction(
                              `/api/games/${game.id}/seats/${seat}/assign-bot`,
                            )
                          }
                        >
                          Assign bot
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {player?.playerToken === viewerToken &&
                  player.status === "claimed" ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        void postSeatAction(
                          `/api/games/${game.id}/seats/${seat}/release`,
                        )
                      }
                    >
                      Stand up
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
          {(() => {
            const filled = game.poker.players.filter(
              (player) =>
                player.status === "claimed" || player.status === "bot",
            ).length;
            const canManage =
              !game.poker.players.some((player) => player.isHost) ||
              game.poker.players.some(
                (player) => player.isHost && player.playerToken === viewerToken,
              );
            return (
              <div className="lobby-footer">
                <button
                  type="button"
                  disabled={!canManage || filled < 2 || loading}
                  onClick={() => void startWaitingGame()}
                >
                  Start hand
                </button>
                {!canManage ? (
                  <span>Waiting for the host to start.</span>
                ) : null}
              </div>
            );
          })()}
        </section>
      ) : !human ? (
        <section className="empty-state">
          <p>This table is waiting for a playable seat.</p>
        </section>
      ) : (
        <div className="game-layout">
          <section className="table-shell">
            <div className="table-meta">
              <span>HAND {game.poker.handNumber}</span>
              <span>{game.poker.street?.toUpperCase() ?? "WAITING"}</span>
              <button
                type="button"
                className="history-toggle"
                onClick={() => setHistoryOpen(true)}
              >
                History
              </button>
            </div>
            <div className="felt">
              <div className="seat-row top-row">
                {seatRows.top.map((player) => (
                  <Seat
                    key={player.id}
                    player={player}
                    active={game.poker.currentActorId === player.id}
                  />
                ))}
              </div>
              <div className="center-table">
                <div className="pot">
                  POT <strong>{formatChips(game.poker.pot)}</strong>
                </div>
                <div className="community-cards">
                  {[
                    ...game.poker.communityCards,
                    ...Array(
                      Math.max(0, 5 - game.poker.communityCards.length),
                    ).fill(""),
                  ].map((card, index) => (
                    <PlayingCard
                      key={`${card}-${index}`}
                      card={card || undefined}
                    />
                  ))}
                </div>
                <p className="hand-result" aria-live="polite">
                  {handResult ?? "\u00a0"}
                </p>
              </div>
              <div className="seat-row bottom-row">
                {seatRows.bottom.map((player) => (
                  <Seat
                    key={player.id}
                    player={player}
                    active={game.poker.currentActorId === player.id}
                  />
                ))}
              </div>
            </div>
            <section className="action-tray">
              <div className="action-caption">
                {isSpectator
                  ? "Spectating"
                  : isHumanTurn
                    ? "Your legal actions"
                    : currentActor?.controller === "typesafe_ai"
                      ? "TypeSafe AI is deciding"
                      : "Hand complete"}
              </div>
              {isSpectator ? (
                <div className="action-controls">
                  <button
                    type="button"
                    disabled={
                      loading ||
                      !game.poker.players.some(
                        (player) => player.status === "open",
                      )
                    }
                    onClick={() => void claimFirstOpenSeat()}
                  >
                    {loading
                      ? "Claiming seat"
                      : game.poker.players.some(
                            (player) => player.status === "open",
                          )
                        ? "Sit in an open seat"
                        : "No open seats"}
                  </button>
                </div>
              ) : (
                <>
                  {human.playerToken === viewerToken ? (
                    <div className="action-controls">
                      <button
                        type="button"
                        disabled={loading || human.leaving}
                        onClick={() =>
                          void postSeatAction(
                            `/api/games/${game.id}/seats/${human.seat}/release`,
                          )
                        }
                      >
                        {human.leaving ? "Leaving after this hand" : "Stand up"}
                      </button>
                    </div>
                  ) : null}
                  <div className="action-controls">
                    {game.poker.legalActions.map((action) => (
                      <button
                        key={action.type}
                        disabled={!isHumanTurn || loading}
                        onClick={() => void submitAction(action)}
                      >
                        {action.type === "call"
                          ? `Call ${formatChips(action.amount)}`
                          : action.type === "bet" || action.type === "raise"
                            ? `${action.type[0].toUpperCase()}${action.type.slice(1)}`
                            : action.type[0].toUpperCase() +
                              action.type.slice(1)}
                      </button>
                    ))}
                    {game.poker.street === "complete" ? (
                      <button
                        disabled={loading}
                        onClick={() => void beginNextHand()}
                      >
                        {loading ? "Preparing" : "Next Hand"}
                      </button>
                    ) : null}
                  </div>
                  {sizedAction && isHumanTurn ? (
                    <label className="amount-control">
                      <span>{sizedAction.type} to</span>
                      <input
                        type="number"
                        min={sizedAction.minAmount}
                        max={sizedAction.maxAmount}
                        value={amount ?? sizedAction.minAmount}
                        onChange={(event) =>
                          setAmount(Number(event.target.value))
                        }
                      />
                      <small>
                        {formatChips(sizedAction.minAmount)} -{" "}
                        {formatChips(sizedAction.maxAmount)}
                      </small>
                    </label>
                  ) : null}
                </>
              )}
            </section>
          </section>
          {historyOpen && displayedHistoryHand ? (
            <div
              className="history-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Action history"
            >
              <div
                className="history-backdrop"
                onClick={() => setHistoryOpen(false)}
              />
              <div className="history-dialog">
                <button
                  type="button"
                  className="history-close"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Close action history"
                >
                  ×
                </button>
                <ActionHistory
                  availableHands={availableHistoryHands}
                  handNumber={displayedHistoryHand}
                  history={currentHistory}
                  onSelectHand={setSelectedHistoryHand}
                  liveDecisions={
                    displayedHistoryHand === game?.poker.handNumber
                      ? liveDecisions
                      : []
                  }
                />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
