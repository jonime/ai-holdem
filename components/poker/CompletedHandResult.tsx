import { PlayingCard } from "./PlayingCard";
import type { PublicPokerGame } from "@/lib/poker/types";
import { useI18n } from "@/components/poker/I18nProvider";
import { formatChips } from "@/components/poker/view-model";
import styles from "@/components/poker/PokerTable.module.css";

export function CompletedHandResult({
  poker,
}: {
  readonly poker: PublicPokerGame;
}) {
  const { locale, t, dictionary } = useI18n();
  if (poker.street !== "complete") return null;

  return (
    <div className={styles.handResult} data-hand-result>
      <h2>{t(poker.winnerIds.length > 1 ? "result.potAwards" : "result.title")}</h2>
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
      {poker.completionReason === "fold" ? (
        <p>{t("result.uncontested")}</p>
      ) : null}
    </div>
  );
}
