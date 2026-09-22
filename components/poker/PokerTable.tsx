import { PlayingCard } from "@/components/poker/PlayingCard";
import { Seat } from "@/components/poker/Seat";
import type {
  Game,
  LegalAction,
  PublicPokerPlayer,
} from "@/components/poker/types";
import { formatChips } from "@/components/poker/view-model";

export function PokerTable({
  game,
  seatRows,
  human,
  viewerToken,
  currentActor,
  isSpectator,
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
  handResult,
}: {
  readonly game: Game;
  readonly seatRows: {
    readonly top: readonly PublicPokerPlayer[];
    readonly bottom: readonly PublicPokerPlayer[];
  };
  readonly human: PublicPokerPlayer;
  readonly viewerToken: string | null;
  readonly currentActor: PublicPokerPlayer | undefined;
  readonly isSpectator: boolean;
  readonly isHumanTurn: boolean;
  readonly sizedAction:
    | Extract<LegalAction, { type: "bet" | "raise" }>
    | undefined;
  readonly amount: number | null;
  readonly loading: boolean;
  readonly setAmount: (value: number | null) => void;
  readonly onClaimFirstOpenSeat: () => void;
  readonly onStandUp: () => void;
  readonly onSubmitAction: (action: LegalAction) => void;
  readonly onBeginNextHand: () => void;
  readonly onOpenHistory: () => void;
  readonly handResult: string | null;
}) {
  return (
    <section className="table-shell">
      <div className="table-meta">
        <span>HAND {game.poker.handNumber}</span>
        <span>{game.poker.street?.toUpperCase() ?? "WAITING"}</span>
        <button
          type="button"
          className="history-toggle"
          onClick={onOpenHistory}
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
              ...Array(Math.max(0, 5 - game.poker.communityCards.length)).fill(
                "",
              ),
            ].map((card, index) => (
              <PlayingCard key={`${card}-${index}`} card={card || undefined} />
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
                !game.poker.players.some((player) => player.status === "open")
              }
              onClick={onClaimFirstOpenSeat}
            >
              {loading
                ? "Claiming seat"
                : game.poker.players.some((player) => player.status === "open")
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
                  onClick={onStandUp}
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
                  onClick={() => onSubmitAction(action)}
                >
                  {action.type === "call"
                    ? `Call ${formatChips(action.amount)}`
                    : action.type === "bet" || action.type === "raise"
                      ? `${action.type[0].toUpperCase()}${action.type.slice(1)}`
                      : action.type[0].toUpperCase() + action.type.slice(1)}
                </button>
              ))}
              {game.poker.street === "complete" ? (
                <button disabled={loading} onClick={onBeginNextHand}>
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
          </>
        )}
      </section>
    </section>
  );
}
