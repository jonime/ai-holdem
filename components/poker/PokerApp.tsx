"use client";

import { useEffect, useState } from "react";

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
  readonly stack: number;
  readonly folded: boolean;
  readonly allIn: boolean;
  readonly holeCards: readonly string[] | null;
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

function Seat({
  player,
  active,
}: {
  readonly player: Player;
  readonly active: boolean;
}) {
  const isAi = player.controller === "typesafe_ai";
  return (
    <section
      className={`seat ${isAi ? "ai-seat" : "human-seat"} ${active ? "active-seat" : ""}`}
    >
      <div className="seat-heading">
        <span className="seat-label">{isAi ? "TYPESAFE AI" : "YOU"}</span>
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
        {player.folded
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

function DecisionPanel({ decision }: { readonly decision: AIDecision | null }) {
  if (!decision) {
    return (
      <section className="decision-panel muted-panel">
        <p>TypeSafe decision data appears after the AI acts.</p>
      </section>
    );
  }
  return (
    <section className="decision-panel">
      <div className="panel-kicker">TYPE SAFE SYSTEM ONE</div>
      <h2>Latest Decision</h2>
      <div className="selected-decision">
        {decision.action.toUpperCase()}
        {decision.amount !== null ? ` ${formatChips(decision.amount)}` : ""}
      </div>
      <div className="probability-list">
        {Object.entries(decision.probabilities).map(([choice, probability]) => (
          <div className="probability" key={choice}>
            <span>{choice}</span>
            <div className="probability-track">
              <i style={{ width: `${probability * 100}%` }} />
            </div>
            <b>{Math.round(probability * 100)}%</b>
          </div>
        ))}
      </div>
      <div className="confidence">
        Confidence <strong>{Math.round(decision.confidence * 100)}%</strong>
      </div>
    </section>
  );
}

function ActionHistory({ history }: { readonly history: HandHistory | null }) {
  if (!history) {
    return (
      <section className="history-panel muted-panel">
        <p>Hand history loads with the table.</p>
      </section>
    );
  }

  return (
    <section className="history-panel">
      <div className="panel-kicker">PERSISTED HAND</div>
      <h2>Action History</h2>
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
            const actionLabel = `${action.action}${action.amount !== null ? ` ${formatChips(action.amount)}` : ""}`;

            return (
              <li
                key={action.sequence}
                className={
                  action.controller === "typesafe_ai" ? "ai-history" : ""
                }
              >
                {inspection ? (
                  <details className="history-inspection">
                    <summary>
                      <span>{action.player}</span>
                      <b>{actionLabel}</b>
                      <small>{action.street}</small>
                    </summary>
                    <div className="inspection-entry">
                      <strong>
                        {inspection.choice.toUpperCase()} /{" "}
                        {Math.round(inspection.confidence * 100)}%
                      </strong>
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
                ) : (
                  <>
                    <span>{action.player}</span>
                    <b>{actionLabel}</b>
                    <small>{action.street}</small>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default function PokerApp() {
  const [game, setGame] = useState<Game | null>(null);
  const [decision, setDecision] = useState<AIDecision | null>(null);
  const [history, setHistory] = useState<{
    readonly handNumber: number;
    readonly value: HandHistory;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);

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

  useEffect(() => {
    const gameId = window.localStorage.getItem(gameStorageKey);
    if (!gameId) return;
    let cancelled = false;

    void fetch(`/api/games/${gameId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Stored game is unavailable");
        return (await response.json()) as { game: Game };
      })
      .then((body) => {
        if (!cancelled) setGame(body.game);
      })
      .catch(() => window.localStorage.removeItem(gameStorageKey));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    void fetch(`/api/games/${game.id}/history?hand=${game.poker.handNumber}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Hand history is unavailable");
        return (await response.json()) as { history: HandHistory };
      })
      .then((body) => {
        if (!cancelled)
          setHistory({
            handNumber: game.poker.handNumber,
            value: body.history,
          });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [game]);

  async function createGame() {
    setLoading(true);
    setError(null);
    setDecision(null);
    try {
      const body = await requestJson<{ gameId: string }>("/api/games", {
        method: "POST",
      });
      window.localStorage.setItem(gameStorageKey, body.gameId);
      await loadGame(body.gameId);
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

  async function advanceAiTurns(nextGame: Game) {
    let current = nextGame;
    for (
      let attempts = 0;
      attempts < 4 &&
      current.status === "playing" &&
      current.poker.currentActorId === "typesafe-ai";
      attempts += 1
    ) {
      const body = await requestJson<{ game: Game; aiDecision: AIDecision }>(
        `/api/games/${current.id}/step`,
        { method: "POST" },
      );
      current = body.game;
      setGame(current);
      setDecision(body.aiDecision);
    }
  }

  async function continueAiTurn() {
    if (!game) return;
    setLoading(true);
    setError(null);
    try {
      await advanceAiTurns(game);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to advance TypeSafe AI",
      );
    } finally {
      setLoading(false);
    }
  }

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
    setDecision(null);
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

  const human = game?.poker.players.find((player) => player.id === "human");
  const ai = game?.poker.players.find((player) => player.id === "typesafe-ai");
  const sizedAction = game?.poker.legalActions.find(
    (action) => action.type === "bet" || action.type === "raise",
  );
  const isHumanTurn = game?.poker.currentActorId === "human";
  const currentHistory =
    history && history.handNumber === game?.poker.handNumber
      ? history.value
      : null;
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
      <header className="app-header">
        <div>
          <p className="eyebrow">TYPE SAFE AI / DECISION DEMO</p>
          <h1>Texas Hold&apos;em</h1>
        </div>
        <button
          className="new-game"
          onClick={() => void createGame()}
          disabled={loading}
        >
          {loading ? "Working" : "New Game"}
        </button>
      </header>
      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}
      {!game || !human || !ai ? (
        <section className="empty-state">
          <p>Start a heads-up hand against TypeSafe AI.</p>
          <button onClick={() => void createGame()} disabled={loading}>
            {loading ? "Preparing table" : "Deal a hand"}
          </button>
        </section>
      ) : (
        <div className="game-layout">
          <section className="table-shell">
            <div className="table-meta">
              <span>HAND {game.poker.handNumber}</span>
              <span>{game.poker.street?.toUpperCase() ?? "WAITING"}</span>
            </div>
            <div className="felt">
              <Seat player={ai} active={game.poker.currentActorId === ai.id} />
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
                {game.poker.street === "complete" ? (
                  <p className="hand-result">{handResult}</p>
                ) : null}
              </div>
              <Seat player={human} active={isHumanTurn} />
            </div>
            <section className="action-tray">
              <div className="action-caption">
                {isHumanTurn
                  ? "Your legal actions"
                  : game.poker.currentActorId === "typesafe-ai"
                    ? "TypeSafe AI is deciding"
                    : "Hand complete"}
              </div>
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
                        : action.type[0].toUpperCase() + action.type.slice(1)}
                  </button>
                ))}
                {game.poker.currentActorId === "typesafe-ai" ? (
                  <button
                    disabled={loading}
                    onClick={() => void continueAiTurn()}
                  >
                    {loading ? "TypeSafe is thinking" : "Continue AI"}
                  </button>
                ) : null}
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
                    onChange={(event) => setAmount(Number(event.target.value))}
                  />
                  <small>
                    {formatChips(sizedAction.minAmount)} -{" "}
                    {formatChips(sizedAction.maxAmount)}
                  </small>
                </label>
              ) : null}
            </section>
          </section>
          <aside>
            <DecisionPanel decision={decision} />
            <ActionHistory history={currentHistory} />
            <section className="rules-note">
              <p className="panel-kicker">AUTHORITATIVE RULES</p>
              <p>
                Every action is checked by the poker engine before it changes
                the hand.
              </p>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
