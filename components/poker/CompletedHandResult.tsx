import { useAmounts, AmountText } from "./AmountDisplay";
import { PlayingCard } from "./PlayingCard";
import type { PublicPokerGame } from "@/lib/poker/types";
import { useI18n } from "@/components/poker/I18nProvider";
import styles from "@/components/poker/PokerTable.module.css";

export function CompletedHandResult({
  poker,
}: {
  readonly poker: PublicPokerGame;
}) {
  const { t, dictionary } = useI18n();
  const { format } = useAmounts(poker.bigBlind);
  if (poker.street !== "complete") return null;

  const personal = poker.viewerHandResult;

  return (
    <div className={styles.handResult} data-hand-result>
      {personal ? (
        <div className={styles.personalResult} data-personal-result
          data-outcome={personal.netChange > 0 ? "gain" : personal.netChange < 0 ? "loss" : "even"}>
          <strong><AmountText>{t(personal.netChange > 0 ? "result.gained" : personal.netChange < 0 ? "result.lost" : "result.brokeEven", {
            amount: format(Math.abs(personal.netChange)),
          })}</AmountText></strong>
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
                <AmountText>{t("result.award", {
                  player: player.name,
                  amount: format(amount),
                })}</AmountText>
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
