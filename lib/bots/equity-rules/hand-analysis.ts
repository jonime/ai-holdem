import { evaluateHand, parseCard } from "@hivetech/poker-engine";

export type PreflopTier =
  | "premium"
  | "strong"
  | "playable"
  | "speculative"
  | "weak";

export interface PreflopFeatures {
  readonly tier: PreflopTier;
  readonly pair: boolean;
  readonly suited: boolean;
  readonly connected: boolean;
  readonly gap: number;
  readonly highCard: number;
  readonly lowCard: number;
}

export interface MadeHandSummary {
  readonly category: string | null;
  readonly bestFive: readonly string[];
  readonly usesHoleCards: boolean;
}

export interface DrawSummary {
  readonly flushDraw: boolean;
  readonly straightDraw: boolean;
  readonly openEnded: boolean;
  readonly gutshot: boolean;
  readonly overcard: boolean;
  readonly comboDraw: boolean;
}

export interface BoardTexture {
  readonly label: "dry" | "neutral" | "wet";
  readonly paired: boolean;
  readonly suited: boolean;
  readonly connected: boolean;
}

function rankValue(card: string): number {
  const value = parseCard(card).rank;
  return value === "A"
    ? 14
    : value === "K"
      ? 13
      : value === "Q"
        ? 12
        : value === "J"
          ? 11
          : Number(value);
}

function rankValueFromCode(value: string): number {
  return value === "A"
    ? 14
    : value === "K"
      ? 13
      : value === "Q"
        ? 12
        : value === "J"
          ? 11
          : Number(value);
}

function toCardString(card: { rank: string; suit: string }): string {
  return `${card.rank}${card.suit}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function inferTier(
  high: number,
  pair: boolean,
  suited: boolean,
  connected: boolean,
): PreflopTier {
  if (pair) {
    if (high >= 11) return "premium";
    if (high >= 8) return "strong";
    return "playable";
  }
  if (suited && high >= 12) return "premium";
  if (suited && high >= 10) return "strong";
  if (connected && high >= 10) return "strong";
  if (high >= 10) return "playable";
  if (suited || connected) return "speculative";
  return "weak";
}

export function analyzePreflopFeatures(
  cards: readonly string[],
): PreflopFeatures {
  if (cards.length !== 2) {
    throw new Error("Preflop analysis requires exactly two cards");
  }
  const parsed = cards.map((card) => parseCard(card));
  const ranks = [...parsed]
    .map((card) => rankValueFromCode(card.rank))
    .sort((left, right) => left - right);
  const suits = parsed.map((card) => card.suit);
  const pair = ranks[0] === ranks[1];
  const suited = suits[0] === suits[1];
  const high = ranks[1];
  const low = ranks[0];
  const connected = !pair && high - low <= 4;
  const gap = pair ? 0 : clamp(high - low - 1, 0, 12);

  return {
    tier: inferTier(high, pair, suited, connected),
    pair,
    suited,
    connected,
    gap,
    highCard: high,
    lowCard: low,
  };
}

export function evaluateMadeHand(
  heroCards: readonly string[],
  boardCards: readonly string[],
): MadeHandSummary {
  const available = [...heroCards, ...boardCards].map(parseCard);
  if (available.length < 5) {
    return { category: null, bestFive: [], usesHoleCards: false };
  }
  const rank = evaluateHand(available);
  const holeCards = new Set(heroCards);
  return {
    category: rank?.category ?? null,
    bestFive: rank?.cards.map((card) => toCardString(card)) ?? [],
    usesHoleCards:
      rank?.cards.some((card) => holeCards.has(toCardString(card))) ?? false,
  };
}

function straightRanks(values: readonly number[]): number[] {
  const unique = [...new Set(values)].sort((left, right) => left - right);
  const withWheel = new Set(unique);
  if (withWheel.has(14)) withWheel.add(1);
  const sorted = [...withWheel].sort((left, right) => left - right);
  const possible: number[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const sequence = [sorted[index]];
    for (let next = index + 1; next < sorted.length; next += 1) {
      if (sorted[next] - sequence[sequence.length - 1] === 1) {
        sequence.push(sorted[next]);
      }
    }
    if (sequence.length >= 4) {
      possible.push(sequence[sequence.length - 1]);
    }
  }
  return possible;
}

export function summarizeDraws(
  heroCards: readonly string[],
  boardCards: readonly string[],
): DrawSummary {
  const allCards = [...heroCards, ...boardCards];
  const suits = new Map<string, number>();
  for (const card of allCards) {
    const parsed = parseCard(card);
    suits.set(parsed.suit, (suits.get(parsed.suit) ?? 0) + 1);
  }
  const flushDraw = [...suits.values()].some((count) => count >= 3);
  const values = allCards.map((card) => rankValue(card));
  const straightPotential = straightRanks(values);
  const straightDraw = straightPotential.length > 0;
  const overcard =
    heroCards.length === 2 &&
    boardCards.length > 0 &&
    Math.max(...heroCards.map(rankValue)) >
      Math.max(...boardCards.map(rankValue));
  const openEnded =
    values.length >= 4 &&
    straightDraw &&
    values.filter((value) => value >= 2).length >= 4;
  const gutshot = values.length >= 4 && straightDraw && !openEnded;

  return {
    flushDraw,
    straightDraw,
    openEnded,
    gutshot,
    overcard,
    comboDraw: flushDraw && straightDraw,
  };
}

export function deriveBoardTexture(
  boardCards: readonly string[],
): BoardTexture {
  if (boardCards.length === 0) {
    return { label: "dry", paired: false, suited: false, connected: false };
  }

  const ranks = boardCards.map(rankValue).sort((left, right) => left - right);
  const suitCounts = new Map<string, number>();
  for (const card of boardCards) {
    const parsed = parseCard(card);
    suitCounts.set(parsed.suit, (suitCounts.get(parsed.suit) ?? 0) + 1);
  }
  const paired = new Set(ranks).size !== ranks.length;
  const suited = [...suitCounts.values()].some((count) => count >= 3);
  const connected =
    ranks.length >= 3 &&
    ranks.some((value, index) => {
      if (index === 0) return false;
      return value - ranks[index - 1] === 1;
    });

  let label: BoardTexture["label"] = "dry";
  if (suited || connected || paired) {
    if (suited && (connected || paired)) label = "wet";
    else label = "neutral";
  }

  return {
    label,
    paired,
    suited,
    connected,
  };
}
