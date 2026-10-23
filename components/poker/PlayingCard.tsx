import { CardImage } from "./CardImage";
import suitStyles from "./SuitColour.module.css";
import { cardLabel } from "@/components/poker/view-model";
import { useI18n } from "@/components/poker/I18nProvider";
import styles from "@/components/poker/PlayingCard.module.css";

export function PlayingCard({
  card,
  hidden = false,
  holeCard,
}: {
  readonly card?: string;
  readonly hidden?: boolean;
  readonly holeCard?: boolean;
}) {
  const { dictionary, t } = useI18n();
  if (hidden) {
    return (
      <CardImage
        className={`${styles.playingCard} ${styles.cardBack}`}
        data-playing-card
        aria-label={t("cards.hidden")}
      >
        <span className={styles.cardBackLogo} aria-hidden="true">♠</span>
      </CardImage>
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
  return (
    <CardImage
      className={`${styles.playingCard} ${suitStyles.suit} ${holeCard === true ? styles.holeCard : ""}`}
      data-playing-card
      data-suit={suit}
      data-hole-card={holeCard === true ? "true" : undefined}
      aria-label={holeCard === undefined ? cardLabel(card, dictionary.cards) : t(
        holeCard ? "result.holeCardDescription" : "result.boardCardDescription",
        { card: cardLabel(card, dictionary.cards) },
      )}
    >
      <span className={styles.cardFace} aria-hidden="true">
        <span className={styles.cardRank}>{rank}</span>
        <span className={styles.cardSuit}>{suitSymbol[suit]}</span>
      </span>
    </CardImage>
  );
}
