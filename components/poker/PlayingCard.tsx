import { cardLabel } from "@/components/poker/view-model";

export function PlayingCard({
  card,
  hidden = false,
}: {
  readonly card?: string;
  readonly hidden?: boolean;
}) {
  if (hidden) {
    return (
      <span className="playing-card card-back" aria-label="Hidden card">
        TS
      </span>
    );
  }
  if (!card) {
    return <span className="playing-card empty-card" aria-hidden="true" />;
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
      className={`playing-card ${red ? "red-card" : ""}`}
      aria-label={cardLabel(card)}
    >
      {rank}
      {suitSymbol[suit]}
    </span>
  );
}
