import { PlayingCard } from "@/components/poker/PlayingCard";
import { Seat } from "@/components/poker/Seat";
import type {
  Game,
  LegalAction,
  LatestPlayerAction,
  PublicPokerPlayer,
} from "@/components/poker/types";
import { findGameWinnerId, formatChips } from "@/components/poker/view-model";

export function PokerTable({
  game,
  seatRows,
  linearSeats,
  human,
  viewerToken,
  isSpectator,
  canStartNextHand,
  isHumanTurn,
  sizedAction,
  amount,
  loading,
  setAmount,
  onClaimFirstOpenSeat,
  onStandUp,
  onSubmitAction,
  onBeginNextHand,
  onOpenHistory,
  latestActions,
}: {
  readonly game: Game;
  readonly seatRows: {
    readonly top: readonly PublicPokerPlayer[];
    readonly bottom: readonly PublicPokerPlayer[];
  };
  readonly linearSeats: readonly PublicPokerPlayer[];
  readonly human: PublicPokerPlayer | null;
  readonly viewerToken: string | null;
  readonly isSpectator: boolean;
  readonly canStartNextHand: boolean;
  readonly isHumanTurn: boolean;
  readonly sizedAction:
    | Extract<LegalAction, { type: "bet" | "raise" }>
    | undefined;
  readonly amount: number | null;
  readonly loading: boolean;
  readonly setAmount: (value: number | null) => void;
  readonly onClaimFirstOpenSeat: () => void;
  readonly onStandUp: () => void;
  readonly onSubmitAction: (
    action: LegalAction,
    amountOverride?: number | null,
  ) => void;
  readonly onBeginNextHand: () => void;
  readonly onOpenHistory: () => void;
  readonly latestActions: Readonly<Record<string, LatestPlayerAction>>;
}) {
  const gameWinnerId = findGameWinnerId(game.poker.players, game.poker.street);
  const gameOver = gameWinnerId !== null;
  const legalAction = (type: LegalAction["type"]) =>
    game.poker.legalActions.find((action) => action.type === type);
  const checkCallAction = legalAction("check") ?? legalAction("call");
  const botOnlyGame = game.poker.players
    .filter((player) => player.status === "claimed" || player.status === "bot")
    .every((player) => player.controller === "typesafe_ai");
  const selectedAmount = sizedAction
    ? Math.min(
        sizedAction.maxAmount,
        Math.max(sizedAction.minAmount, amount ?? sizedAction.minAmount),
      )
    : null;
  const potPresetAmount = (fraction: number) => {
    if (!sizedAction) return 0;
    const call = legalAction("call");
    const callAmount = call?.type === "call" ? call.amount : 0;
    const target =
      sizedAction.type === "raise"
        ? callAmount + Math.round(game.poker.pot * fraction)
        : Math.round(game.poker.pot * fraction);
    return Math.min(
      sizedAction.maxAmount,
      Math.max(sizedAction.minAmount, target),
    );
  };
  const submitFixedAction = (type: LegalAction["type"]) => {
    const action = legalAction(type);
    if (!action) return;
    if (
      (action.type === "bet" || action.type === "raise") &&
      selectedAmount !== null
    ) {
      onSubmitAction(action, selectedAmount);
      return;
    }
    onSubmitAction(action);
  };

  return (
    <section className="table-shell">
      <div className="table-meta">
        <span>HAND {game.poker.handNumber}</span>
        <span>{game.poker.street?.toUpperCase() ?? "WAITING"}</span>
        <div className="table-meta-actions">
          {human?.playerToken === viewerToken ? (
            <button
              type="button"
              className="stand-up-toggle"
              disabled={loading || human.leaving}
              onClick={onStandUp}
            >
              {human.leaving ? "Leaving" : "Stand up"}
            </button>
          ) : null}
          <button
            type="button"
            className="history-toggle"
            onClick={onOpenHistory}
          >
            History
          </button>
        </div>
      </div>
      <div className="felt">
        <div className="seat-row top-row desktop-seats">
          {seatRows.top.map((player) => (
            <Seat
              key={player.id}
              player={player}
              active={game.poker.currentActorId === player.id}
              winner={game.poker.winnerIds.includes(player.id)}
              winnerAmount={game.poker.winnerAmounts[player.id] ?? null}
              latestAction={latestActions[player.id] ?? null}
              dealerSeat={game.poker.dealerSeat}
              smallBlindSeat={game.poker.smallBlindSeat}
              bigBlindSeat={game.poker.bigBlindSeat}
              gameWinner={player.id === gameWinnerId}
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
              ...Array(Math.max(0, 5 - game.poker.communityCards.length)).fill(
                "",
              ),
            ].map((card, index) => (
              <PlayingCard key={`${card}-${index}`} card={card || undefined} />
            ))}
          </div>
        </div>
        <div className="seat-row bottom-row desktop-seats">
          {seatRows.bottom.map((player) => (
            <Seat
              key={player.id}
              player={player}
              active={game.poker.currentActorId === player.id}
              winner={game.poker.winnerIds.includes(player.id)}
              winnerAmount={game.poker.winnerAmounts[player.id] ?? null}
              latestAction={latestActions[player.id] ?? null}
              dealerSeat={game.poker.dealerSeat}
              smallBlindSeat={game.poker.smallBlindSeat}
              bigBlindSeat={game.poker.bigBlindSeat}
              gameWinner={player.id === gameWinnerId}
            />
          ))}
        </div>
        <div className="seat-grid mobile-seats">
          {linearSeats.map((player) => (
            <Seat
              key={player.id}
              player={player}
              active={game.poker.currentActorId === player.id}
              winner={game.poker.winnerIds.includes(player.id)}
              winnerAmount={game.poker.winnerAmounts[player.id] ?? null}
              latestAction={latestActions[player.id] ?? null}
              dealerSeat={game.poker.dealerSeat}
              smallBlindSeat={game.poker.smallBlindSeat}
              bigBlindSeat={game.poker.bigBlindSeat}
              gameWinner={player.id === gameWinnerId}
            />
          ))}
        </div>
      </div>
      <section className="action-tray">
        {isSpectator ? (
          <div className="action-controls">
            {botOnlyGame && !gameOver ? (
              <button
                type="button"
                disabled={
                  loading ||
                  game.poker.street !== "complete" ||
                  !canStartNextHand
                }
                onClick={onBeginNextHand}
              >
                Next Hand
              </button>
            ) : !botOnlyGame &&
              game.poker.players.some((player) => player.status === "open") ? (
              <button
                type="button"
                disabled={loading}
                onClick={onClaimFirstOpenSeat}
              >
                {loading ? "Claiming seat" : "Sit in an open seat"}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="action-controls">
              <button
                type="button"
                disabled={!isHumanTurn || loading || !legalAction("fold")}
                onClick={() => submitFixedAction("fold")}
              >
                Fold
              </button>
              <button
                type="button"
                disabled={
                  loading ||
                  gameOver ||
                  (game.poker.street === "complete"
                    ? human?.playerToken !== viewerToken
                    : !isHumanTurn || !checkCallAction)
                }
                onClick={() => {
                  if (game.poker.street === "complete") {
                    onBeginNextHand();
                  } else if (checkCallAction) {
                    submitFixedAction(checkCallAction.type);
                  }
                }}
              >
                {game.poker.street === "complete"
                  ? loading
                    ? "Preparing"
                    : "Next Hand"
                  : checkCallAction?.type === "call"
                    ? `Call ${formatChips(checkCallAction.amount)}`
                    : "Check"}
              </button>
              <button
                type="button"
                disabled={!isHumanTurn || loading || !sizedAction}
                onClick={() => {
                  if (sizedAction) submitFixedAction(sizedAction.type);
                }}
              >
                {sizedAction
                  ? `${sizedAction.type === "raise" ? "Raise" : "Bet"} to ${formatChips(selectedAmount ?? sizedAction.minAmount)}`
                  : "Bet"}
              </button>
            </div>
            <div className="amount-control">
              <div className="amount-heading">
                <span>Bet size</span>
                <strong>
                  {sizedAction && selectedAmount !== null
                    ? formatChips(selectedAmount)
                    : "-"}
                </strong>
              </div>
              <input
                type="range"
                min={sizedAction?.minAmount ?? 0}
                max={sizedAction?.maxAmount ?? 100}
                value={
                  sizedAction ? (selectedAmount ?? sizedAction.minAmount) : 0
                }
                disabled={!sizedAction || !isHumanTurn || loading}
                onChange={(event) => setAmount(Number(event.target.value))}
                aria-label="Bet amount"
              />
              <div className="amount-presets">
                {[0.5, 0.75, 1].map((fraction) => (
                  <button
                    key={fraction}
                    type="button"
                    disabled={!sizedAction || !isHumanTurn || loading}
                    onClick={() => setAmount(potPresetAmount(fraction))}
                  >
                    {fraction === 1 ? "Pot" : `${fraction * 100}% Pot`}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!sizedAction || !isHumanTurn || loading}
                  onClick={() => {
                    if (sizedAction) setAmount(sizedAction.maxAmount);
                  }}
                >
                  Max
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </section>
  );
}
