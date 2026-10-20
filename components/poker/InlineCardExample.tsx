import "server-only";
import { CardImage } from "./CardImage";
import { cardLabel } from "./view-model";
import type { GameDictionary } from "@/lib/i18n/types";
import styles from "./SuitColour.module.css";

const suitNames: Readonly<Record<string, keyof GameDictionary["cards"]>> = { "♠": "spades", "♥": "hearts", "♦": "diamonds", "♣": "clubs" };
const suits: Readonly<Record<string, string>> = { "♠": "s", "♥": "h", "♦": "d", "♣": "c" };

/** Text-sized Help examples share card semantics and localized names. */
export function InlineCardExample({ cards, labels }: { readonly cards: string; readonly labels: GameDictionary["cards"] }) {
  return <span data-card-example>{cards.split(" ").map((card, index) => <span key={index}>
    {index > 0 ? " " : ""}<CardImage aria-label={card.length > 1 ? cardLabel(`${card.slice(0, -1)}${suits[card.at(-1) ?? ""]}`, labels) : labels[suitNames[card] ?? "unknownSuit"]} className={styles.suit} data-suit={suits[card.at(-1) ?? ""]} style={{ whiteSpace: "nowrap" }}>{card}</CardImage>
  </span>)}</span>;
}
