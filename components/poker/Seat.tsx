import { PlayingCard } from "@/components/poker/PlayingCard";
import type {
  LatestPlayerAction,
  PublicPokerPlayer,
} from "@/components/poker/types";
import { describeSeatStatus, formatChips } from "@/components/poker/view-model";
import { useI18n } from "@/components/poker/I18nProvider";
import styles from "@/components/poker/Seat.module.css";

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
  const isAi = player.controller === "bot";
  const isOpen = player.status === "open";
  const isBusted = player.stack === 0 && !player.inHand;
  const role =
    player.seat === dealerSeat
      ? {
          label: dictionary.seat.dealerBadge,
          className: styles.dealerBadge,
          name: dictionary.seat.dealer,
        }
      : player.seat === smallBlindSeat
        ? {
            label: dictionary.seat.smallBlindBadge,
            className: styles.smallBlindBadge,
            name: dictionary.seat.smallBlind,
          }
        : player.seat === bigBlindSeat
          ? {
              label: dictionary.seat.bigBlindBadge,
              className: styles.bigBlindBadge,
              name: dictionary.seat.bigBlind,
            }
          : null;

  if (isOpen) {
    return (
      <section className={`${styles.seat} ${styles.openSeat}`}>
        <div className={styles.seatHeading}>
          <span className={styles.seatLabel}>
            {t("seat.seat", { seat: player.seat + 1 })}
          </span>
        </div>
        <span className={styles.seatStatus}>{t("seat.openSeat")}</span>
      </section>
    );
  }

  return (
    <section
      className={`${styles.seat} ${isAi ? "" : styles.humanSeat} ${player.folded ? styles.foldedSeat : ""} ${isBusted ? styles.bustedSeat : ""} ${active ? styles.activeSeat : ""} ${winner ? styles.winnerSeat : ""}`}
    >
      <span className={styles.seatNumber}>{player.seat + 1}</span>
      <div className={styles.seatHeading}>
        <span className={styles.seatLabel}>{player.name.toUpperCase()}</span>
      </div>
      {role ? (
        <span
          className={`${styles.roleBadge} ${role.className}`}
          title={role.name}
        >
          {role.label}
        </span>
      ) : null}
      {winner || gameWinner ? (
        <span className={styles.winnerBadge}>
          {gameWinner ? dictionary.seat.gameWinner : dictionary.seat.potWinner}
        </span>
      ) : null}
      {winner && winnerAmount !== null ? (
        <span className={styles.winnerAmount}>
          +{formatChips(winnerAmount, locale)}
        </span>
      ) : null}
      <strong>{formatChips(player.stack, locale)}</strong>
      {latestAction?.action === "bet" || latestAction?.action === "raise" ? (
        <span className={styles.actionBadge}>
          {latestAction.action.toUpperCase()}{" "}
          {formatChips(latestAction.amount ?? 0, locale)}
        </span>
      ) : null}
      <div className={styles.holeCards}>
        {player.holeCards ? (
          player.holeCards.map((card) => <PlayingCard key={card} card={card} />)
        ) : (
          <>
            <PlayingCard hidden />
            <PlayingCard hidden />
          </>
        )}
      </div>
      <span className={styles.seatStatus}>
        {player.bestHand
          ? dictionary.seat.handCategories[player.bestHand]
          : describeSeatStatus(
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
