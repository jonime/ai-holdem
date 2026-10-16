import { SeatRoleBadge } from "./SeatRoleBadge";
import { PlayingCard } from "@/components/poker/PlayingCard";
import type {
  LatestPlayerAction,
  PublicPokerPlayer,
} from "@/components/poker/types";
import {
  describeSeatStatus,
  formatChips,
} from "@/components/poker/view-model";
import { useI18n } from "@/components/poker/I18nProvider";
import styles from "@/components/poker/Seat.module.css";

export function Seat({
  player,
  isViewer,
  showCurrentHand,
  handActive,
  countdown,
  active,
  winner,
  winnerAmount,
  latestAction,
  dealerSeat,
  smallBlindSeat,
  bigBlindSeat,
  gameWinner,
  onAboutBot,
}: {
  readonly onAboutBot?: (id: string, opener: HTMLButtonElement) => void;
  readonly isViewer: boolean;
  readonly showCurrentHand: boolean;
  readonly handActive: boolean;
  readonly countdown?: import("react").ReactNode;
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
  const showLiveCategory = isViewer && handActive && showCurrentHand;
  const category = player.bestHand ?? (showLiveCategory ? player.currentHandCategory : null);
  const hasWagerBadge = latestAction?.action === "bet" || latestAction?.action === "raise";
  const wagerReplacesStatus = hasWagerBadge && player.inHand && !player.leaving &&
    !player.folded && !player.allIn && !active;
  const status = player.bestHand || wagerReplacesStatus ? null : describeSeatStatus(
    { leaving: player.leaving, inHand: player.inHand, folded: player.folded,
      allIn: player.allIn, stack: player.stack, active,
      isViewer: isViewer && player.controller === "human" },
    latestAction, dictionary.seat, dictionary.actions, locale,
  );
  const isYourTurn = isViewer && player.controller === "human" && active && handActive &&
    player.inHand && !player.leaving && !player.folded && !player.allIn && !player.bestHand;
  const award = winner && winnerAmount !== null ? `+${formatChips(winnerAmount, locale)}` : null;
  const isBusted = player.stack === 0 && !player.inHand;

  if (isOpen) {
    return (
      <section className={`${styles.seat} ${styles.openSeat}`}>
        <div className={styles.seatHeading}>
          <span className={styles.seatLabel}>
            {t("seat.seat", { seat: player.seat + 1 })}
          </span>
        </div>
        <span className={styles.currentHand} data-hand-category-slot aria-hidden="true" />
        <span className={styles.seatStatus} data-seat-status>{t("seat.openSeat")}</span>
      </section>
    );
  }

  return (
    <section
      className={`${styles.seat} ${isAi ? "" : styles.humanSeat} ${player.folded ? styles.foldedSeat : ""} ${isBusted ? styles.bustedSeat : ""} ${active ? styles.activeSeat : ""} ${winner ? styles.winnerSeat : ""}`}
    >
      <span className={styles.seatNumber}>{player.seat + 1}</span>
      <div className={styles.seatHeading}>
        {isAi ? <button type="button" className={`${styles.seatLabel} ${styles.botName}`}
          aria-label={t("botInformation.open", { name: player.name })} aria-haspopup="dialog"
          onClick={event => onAboutBot?.(player.id, event.currentTarget)}>
          {player.name.toUpperCase()}
        </button> : <span className={styles.seatLabel}>{player.name.toUpperCase()}</span>}
      </div>
      <SeatRoleBadge seat={player.seat} dealerSeat={dealerSeat} smallBlindSeat={smallBlindSeat} bigBlindSeat={bigBlindSeat} />
      {winner || gameWinner ? (
        <span className={styles.winnerBadge}>
          {gameWinner ? dictionary.seat.gameWinner : dictionary.seat.potWinner}
        </span>
      ) : null}
      {countdown}
      <strong>{formatChips(player.stack, locale)}</strong>
      {hasWagerBadge ? (
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
      <span
        className={styles.currentHand}
        data-hand-category-slot
        data-current-hand={showLiveCategory && !player.bestHand ? true : undefined}
        role={category && !player.bestHand ? "group" : undefined}
        aria-hidden={!category ? true : undefined}
        aria-label={category && !player.bestHand ? t("seat.currentHand", { category: dictionary.seat.handCategories[category] }) : undefined}
      >
        {category ? player.bestHand ? dictionary.seat.handCategories[category]
          : <span aria-hidden="true">{dictionary.seat.handCategories[category]}</span> : null}
      </span>
      {status || award ? (
        <span className={`${styles.seatStatus} ${isYourTurn ? styles.yourTurnStatus : ""}`} data-seat-status>
          {status}
          {status && award ? " " : null}
          {award ? <span className={styles.winnerAmount}>{award}</span> : null}
        </span>
      ) : null}
    </section>
  );
}
