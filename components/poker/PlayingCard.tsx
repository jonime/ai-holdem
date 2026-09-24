import { cardLabel } from "@/components/poker/view-model";
import { useI18n } from "@/components/poker/I18nProvider";
import styles from "@/components/poker/PlayingCard.module.css";

export function PlayingCard({
  card,
  hidden = false,
}: {
  readonly card?: string;
  readonly hidden?: boolean;
}) {
  const { dictionary, t } = useI18n();
  if (hidden) {
    return (
      <span
        className={`${styles.playingCard} ${styles.cardBack}`}
        data-playing-card
        aria-label={t("cards.hidden")}
      >
        TS
      </span>
    );
  }
  if (!card) {
    return (
      <span
        className={`${styles.playingCard} ${styles.emptyCard}`}
        data-playing-card
        aria-hidden="true"
      />
    );
  }

  const rank = card.slice(0, -1);
  const suit = card.at(-1) ?? "";
  const suitSymbol: Record<string, string> = {
    c: "♣",
    d: "♦",
    h: "♥",
    s: "♠",
  };
  const red = suit === "d" || suit === "h";
  return (
    <span
      className={`${styles.playingCard} ${red ? styles.redCard : ""}`}
      data-playing-card
      aria-label={cardLabel(card, dictionary.cards)}
    >
      <span className={styles.cardFace} aria-hidden="true">
        <span className={styles.cardRank}>{rank}</span>
        <span className={styles.cardSuit}>{suitSymbol[suit]}</span>
      </span>
    </span>
  );
}
