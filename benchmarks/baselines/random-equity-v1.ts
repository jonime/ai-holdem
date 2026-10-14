import {
  compareHandRanks,
  createDeck,
  evaluateHand,
  parseCard,
  type Card,
} from "@hivetech/poker-engine";

export interface ShowdownEquityInput {
  readonly heroHoleCards: readonly string[];
  readonly communityCards: readonly string[];
  readonly opponentCount: number;
  readonly sampleCount?: number;
  readonly seed?: string;
}

function seedFromString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function drawWithoutReplacement(
  deck: readonly Card[],
  count: number,
  random: () => number,
): Card[] {
  const available = [...deck];
  for (let index = 0; index < count; index += 1) {
    const selected = index + Math.floor(random() * (available.length - index));
    [available[index], available[selected]] = [
      available[selected],
      available[index],
    ];
  }
  return available.slice(0, count);
}

export function calculateShowdownEquity({
  heroHoleCards,
  communityCards,
  opponentCount,
  sampleCount = 5_000,
  seed,
}: ShowdownEquityInput): number {
  if (heroHoleCards.length !== 2) {
    throw new Error("Showdown equity requires exactly two hero hole cards");
  }
  if (communityCards.length > 5) {
    throw new Error("Showdown equity accepts at most five community cards");
  }
  if (!Number.isInteger(opponentCount) || opponentCount < 0) {
    throw new Error("Showdown equity requires a non-negative opponent count");
  }
  if (!Number.isInteger(sampleCount) || sampleCount < 1) {
    throw new Error("Showdown equity requires at least one sample");
  }
  if (opponentCount === 0) return 1;

  const hero = heroHoleCards.map(parseCard);
  const board = communityCards.map(parseCard);
  const knownNames = new Set([...heroHoleCards, ...communityCards]);
  if (knownNames.size !== heroHoleCards.length + communityCards.length) {
    throw new Error("Showdown equity cannot use duplicate known cards");
  }
  const availableDeck = createDeck().filter(
    (card) => !knownNames.has(`${card.rank}${card.suit}`),
  );
  const cardsNeeded = opponentCount * 2 + (5 - board.length);
  if (cardsNeeded > availableDeck.length) {
    throw new Error("Not enough unknown cards for showdown equity");
  }

  const random = createRandom(
    seedFromString(
      seed ??
        JSON.stringify({ heroHoleCards, communityCards, opponentCount }),
    ),
  );
  let equityShare = 0;

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const drawn = drawWithoutReplacement(availableDeck, cardsNeeded, random);
    let offset = 0;
    const opponents: Card[][] = [];
    for (let opponent = 0; opponent < opponentCount; opponent += 1) {
      opponents.push(drawn.slice(offset, offset + 2));
      offset += 2;
    }
    const completedBoard = [...board, ...drawn.slice(offset)];
    const heroRank = evaluateHand([...hero, ...completedBoard]);
    const opponentRanks = opponents.map((cards) =>
      evaluateHand([...cards, ...completedBoard]),
    );
    const bestOpponent = opponentRanks.reduce((best, candidate) =>
      compareHandRanks(candidate, best) > 0 ? candidate : best,
    );
    const comparison = compareHandRanks(heroRank, bestOpponent);
    if (comparison > 0) {
      equityShare += 1;
    } else if (comparison === 0) {
      const tiedOpponents = opponentRanks.filter(
        (rank) => compareHandRanks(rank, heroRank) === 0,
      ).length;
      equityShare += 1 / (tiedOpponents + 1);
    }
  }

  return Math.round((equityShare / sampleCount) * 10_000) / 10_000;
}
