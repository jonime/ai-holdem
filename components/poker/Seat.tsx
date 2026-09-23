import { PlayingCard } from "@/components/poker/PlayingCard";
import type {
  LatestPlayerAction,
  PublicPokerPlayer,
} from "@/components/poker/types";
import { describeSeatStatus, formatChips } from "@/components/poker/view-model";
import { useI18n } from "@/components/poker/I18nProvider";

export function Seat({
  player,
  active,
  winner,
  winnerAmount,
  latestAction,
  dealerSeat,
  smallBlindSeat,
  bigBlindSeat,
  gameWinner,
}: {
  readonly player: PublicPokerPlayer;
  readonly active: boolean;
  readonly winner: boolean;
  readonly winnerAmount: number | null;
  readonly latestAction: LatestPlayerAction | null;
  readonly dealerSeat: number | null;
  readonly smallBlindSeat: number | null;
  readonly bigBlindSeat: number | null;
  readonly gameWinner: boolean;
}) {
  const { dictionary, locale, t } = useI18n();
  const isAi = player.controller === "typesafe_ai";
  const isOpen = player.status === "open";
  const isBusted = player.stack === 0 && !player.inHand;
  const role =
    player.seat === dealerSeat
      ? {
          label: dictionary.seat.dealerBadge,
          className: "dealer-badge",
          name: dictionary.seat.dealer,
        }
      : player.seat === smallBlindSeat
        ? {
            label: dictionary.seat.smallBlindBadge,
            className: "small-blind-badge",
            name: dictionary.seat.smallBlind,
          }
        : player.seat === bigBlindSeat
          ? {
              label: dictionary.seat.bigBlindBadge,
              className: "big-blind-badge",
              name: dictionary.seat.bigBlind,
            }
          : null;

  if (isOpen) {
    return (
      <section className="seat open-seat">
        <div className="seat-heading">
          <span className="seat-label">
            {t("seat.seat", { seat: player.seat + 1 })}
          </span>
        </div>
        <span className="seat-status">{t("seat.openSeat")}</span>
      </section>
    );
  }

  return (
    <section
      className={`seat ${isAi ? "ai-seat" : "human-seat"} ${player.folded ? "folded-seat" : ""} ${isBusted ? "busted-seat" : ""} ${active ? "active-seat" : ""} ${winner ? "winner-seat" : ""}`}
    >
      <span className="seat-number">{player.seat + 1}</span>
      <div className="seat-heading">
        <span className="seat-label">{player.name.toUpperCase()}</span>
      </div>
      {role ? (
        <span className={`role-badge ${role.className}`} title={role.name}>
          {role.label}
        </span>
      ) : null}
      {winner || gameWinner ? (
        <span className="winner-badge">
          {gameWinner ? dictionary.seat.gameWinner : dictionary.seat.potWinner}
        </span>
      ) : null}
      {winner && winnerAmount !== null ? (
        <span className="winner-amount">
          +{formatChips(winnerAmount, locale)}
        </span>
      ) : null}
      <strong>{formatChips(player.stack, locale)}</strong>
      {latestAction?.action === "bet" || latestAction?.action === "raise" ? (
        <span className="action-badge">
          {latestAction.action.toUpperCase()}{" "}
          {formatChips(latestAction.amount ?? 0, locale)}
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
            stack: player.stack,
            active,
          },
          latestAction,
          dictionary.seat,
          dictionary.actions,
          locale,
        )}
      </span>
    </section>
  );
}
