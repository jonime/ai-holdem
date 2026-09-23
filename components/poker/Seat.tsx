import { PlayingCard } from "@/components/poker/PlayingCard";
import type {
  LatestPlayerAction,
  PublicPokerPlayer,
} from "@/components/poker/types";
import { describeSeatStatus, formatChips } from "@/components/poker/view-model";

export function Seat({
  player,
  active,
  winner,
  latestAction,
}: {
  readonly player: PublicPokerPlayer;
  readonly active: boolean;
  readonly winner: boolean;
  readonly latestAction: LatestPlayerAction | null;
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
      className={`seat ${isAi ? "ai-seat" : "human-seat"} ${active ? "active-seat" : ""} ${winner ? "winner-seat" : ""}`}
    >
      <span className="seat-number">{player.seat + 1}</span>
      <div className="seat-heading">
        <span className="seat-label">{player.name.toUpperCase()}</span>
        {active ? (
          <span className="turn-dot" aria-label="Current turn" />
        ) : null}
      </div>
      {winner ? <span className="winner-badge">POT WINNER</span> : null}
      <strong>{formatChips(player.stack)}</strong>
      {latestAction?.action === "bet" || latestAction?.action === "raise" ? (
        <span className="action-badge">
          {latestAction.action.toUpperCase()}{" "}
          {formatChips(latestAction.amount ?? 0)}
        </span>
      ) : null}
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
        {describeSeatStatus(
          {
            leaving: player.leaving,
            inHand: player.inHand,
            folded: player.folded,
            allIn: player.allIn,
            active,
          },
          latestAction,
        )}
      </span>
    </section>
  );
}
