import "server-only";
import styles from "./SuitColour.module.css";

const suits: Readonly<Record<string, string>> = { "♠": "s", "♥": "h", "♦": "d", "♣": "c" };

/** Text-sized Help examples keep their ranks and suit symbols available to readers. */
export function InlineCardExample({ cards }: { readonly cards: string }) {
  return <span data-card-example>{cards.split(" ").map((card, index) => <span key={index}>
    {index > 0 ? " " : ""}<span className={styles.suit} data-suit={suits[card.at(-1) ?? ""]} style={{ whiteSpace: "nowrap" }}>{card}</span>
  </span>)}</span>;
}
