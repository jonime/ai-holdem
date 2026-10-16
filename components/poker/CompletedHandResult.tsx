import { Button } from "@/components/Button";
import { PlayingCard } from "./PlayingCard";
import type { PublicPokerGame } from "@/lib/poker/types";
import { useI18n } from "@/components/poker/I18nProvider";
import { formatChips } from "@/components/poker/view-model";
import styles from "@/components/poker/PokerTable.module.css";

export function CompletedHandResult({
  poker,
  onReviewHand,
}: {
  readonly poker: PublicPokerGame;
  readonly onReviewHand?: (opener: HTMLButtonElement) => void;
}) {
  const { locale, t, dictionary } = useI18n();
  if (poker.street !== "complete") return null;

  const personal = poker.viewerHandResult;

  return (
    <div className={styles.handResult} data-hand-result>
      {personal ? (
        <div className={styles.personalResult} data-personal-result
          data-outcome={personal.netChange > 0 ? "gain" : personal.netChange < 0 ? "loss" : "even"}>
          <strong>{t(personal.netChange > 0 ? "result.gained" : personal.netChange < 0 ? "result.lost" : "result.brokeEven", {
            amount: formatChips(Math.abs(personal.netChange), locale),
          })}</strong>
        </div>
      ) : null}
      {poker.winnerIds.length > 1 ? <h2>{t("result.potAwards")}</h2> : null}
      <ul>
        {poker.winnerIds.map((id) => {
          const player = poker.players.find((candidate) => candidate.id === id);
          const amount = poker.winnerAmounts[id];
          if (!player || amount === undefined) return null;
          return (
            <li key={id}>
              <div>
                {t("result.award", {
                  player: player.name,
                  amount: formatChips(amount, locale),
                })}
                {poker.completionReason === "showdown" && player.bestHand ? (
                  <span> · {dictionary.seat.handCategories[player.bestHand]}</span>
                ) : null}
              </div>
              {poker.completionReason === "showdown" && player.winningHand ? (
                <div className={styles.winningHand} data-winning-hand>
                  <span className={styles.winningLabel}>{t("result.winningFive")}</span>
                  <div className={styles.winningCards}>
                    {player.winningHand.cards.map(card => (
                      <PlayingCard key={card} card={card}
                        holeCard={!player.winningHand?.playsBoard && (player.holeCards?.includes(card) ?? false)} />
                    ))}
                  </div>
                  {player.winningHand.playsBoard ? <p>{t("result.playsBoard")}</p> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {onReviewHand ? <Button size="small" onClick={event => onReviewHand(event.currentTarget)}>{t("replay.title")}</Button> : null}
      {poker.completionReason === "fold" ? (
        <p>{t("result.uncontested")}</p>
      ) : null}
    </div>
  );
}
