import { evaluateVisibleCards } from "@/lib/poker/adapter";

// Compare the adapter's public category/kicker projection, keeping all engine
// evaluation behind the existing adapter and earlier policy freezes intact.
const categories = ["high-card", "one-pair", "two-pair", "three-of-a-kind", "straight",
  "flush", "full-house", "four-of-a-kind", "straight-flush"];
export function evaluateShowdownShare(hero: readonly string[], board: readonly string[], opponents: readonly (readonly string[])[]): number {
  const cards = [...hero, ...board, ...opponents.flat()];
  if (hero.length !== 2 || board.length !== 5 || opponents.some(hole => hole.length !== 2) ||
      cards.some(card => !/^[2-9TJQKA][cdhs]$/.test(card)) || new Set(cards).size !== cards.length) {
    throw new Error("Showdown share requires complete distinct valid cards");
  }
  const strength = (hole: readonly string[]) => {
    const rank = evaluateVisibleCards(hole, board);
    const category = categories.indexOf(rank.category ?? "");
    if (category < 0) throw new Error("Unsupported adapter hand category");
    return [category, ...rank.tiebreak];
  };
  const heroRank = strength(hero);
  let ties = 1;
  for (const hole of opponents) {
    const opponent = strength(hole);
    let comparison = 0;
    for (let index = 0; index < Math.max(heroRank.length, opponent.length); index++) {
      comparison = (opponent[index] ?? 0) - (heroRank[index] ?? 0);
      if (comparison !== 0) break;
    }
    if (comparison > 0) return 0;
    if (comparison === 0) ties++;
  }
  return 1 / ties;
}
