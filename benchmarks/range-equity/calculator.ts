import { evaluateShowdownShare } from "./showdown";

export const RANGE_EQUITY_VERSION = "conditional-range-equity-v1";
export const deck = [..."23456789TJQKA"].flatMap(rank => [..."cdhs"].map(suit => rank + suit));
export interface Combination { readonly cards: readonly string[]; readonly weight: number }
export interface OpponentRange {
  readonly provenance: string;
  readonly combinations: readonly Combination[];
}
export interface RangeEquityInput {
  readonly hero: readonly string[];
  readonly board: readonly string[];
  readonly opponents: readonly OpponentRange[];
  readonly seed: string;
  readonly sampleBudget: number;
  readonly attemptBudget?: number;
  readonly mode?: "auto" | "monte-carlo";
}
interface Metadata {
  readonly version: typeof RANGE_EQUITY_VERSION;
  readonly conditionalOnSuppliedRanges: true;
  readonly provenance: readonly string[];
  readonly sampleCount: number;
  readonly attempts: number;
}
export type RangeEquityResult = Metadata & (
  { readonly status: "supported"; readonly method: "exact-river" | "monte-carlo";
    readonly showdownShare: number; readonly standardError: number;
    readonly confidence95: readonly [number, number] } |
  { readonly status: "unsupported"; readonly reason: "attempt-budget-exhausted" }
);

export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function validCards(cards: readonly string[]) {
  return cards.every(card => deck.includes(card)) && new Set(cards).size === cards.length;
}
function prepare(input: RangeEquityInput) {
  const visible = [...input.hero, ...input.board];
  if (input.hero.length !== 2 || ![0, 3, 4, 5].includes(input.board.length) || !validCards(visible)) {
    throw new Error("Invalid visible cards");
  }
  if (!Number.isInteger(input.sampleBudget) || input.sampleBudget < 2 || input.sampleBudget > 100_000 ||
      typeof input.seed !== "string" || ![undefined, "auto", "monte-carlo"].includes(input.mode) ||
      input.opponents.length < 1 || input.opponents.length > 5) throw new Error("Invalid calculation budget or opponents");
  const attempts = input.attemptBudget ?? Math.min(2_000_000, input.sampleBudget * 100);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 2_000_000) throw new Error("Invalid attempt budget");
  const ranges = input.opponents.map(range => {
    if (typeof range.provenance !== "string" || !range.provenance.trim() ||
        range.combinations.length > 1326) throw new Error("Invalid range provenance or size");
    const seen = new Set<string>();
    const combinations = range.combinations.map(combo => {
      if (combo.cards.length !== 2 || !validCards(combo.cards) ||
          !Number.isFinite(combo.weight) || combo.weight < 0) throw new Error("Invalid range combination or weight");
      const cards = [...combo.cards].sort();
      const key = cards.join("");
      if (seen.has(key)) throw new Error("Duplicate combination");
      seen.add(key);
      return { cards, weight: combo.weight };
    }).filter(combo => combo.weight > 0 && !combo.cards.some(card => visible.includes(card)))
      .sort((a, b) => a.cards.join("").localeCompare(b.cards.join("")));
    if (!combinations.length) throw new Error("Impossible range after blockers and zero weights");
    const max = Math.max(...combinations.map(combo => combo.weight));
    const total = combinations.reduce((sum, combo) => sum + combo.weight / max, 0);
    const normalized = combinations.map(combo => ({ cards: combo.cards, weight: (combo.weight / max) / total }));
    if (normalized.some(combo => combo.weight === 0)) throw new Error("Weights exceed supported numeric dynamic range");
    return { provenance: range.provenance, combinations: normalized };
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { ranges, attempts, visible };
}

/** Independent weighted proposals + whole-tuple rejection sample product weights conditional on compatibility. */
export function calculateRangeEquity(input: RangeEquityInput): RangeEquityResult {
  const { ranges, attempts: limit, visible } = prepare(input);
  const metadata: Omit<Metadata, "sampleCount" | "attempts"> = { version: RANGE_EQUITY_VERSION, conditionalOnSuppliedRanges: true,
    provenance: ranges.map(range => range.provenance) };
  const productSize = ranges.reduce((size, range) => size * range.combinations.length, 1);
  const enumerate = input.board.length === 5 && input.mode !== "monte-carlo" && productSize <= 50_000;
  let count = 0, attempts = 0, mean = 0, m2 = 0;
  if (enumerate) {
    let mass = 0, weightedShare = 0;
    const visit = (index: number, holes: readonly string[][], used: Set<string>, weight: number) => {
      if (index === ranges.length) {
        if (weight === 0) throw new Error("Joint weights exceed supported numeric dynamic range");
        count++;
        mass += weight;
        weightedShare += weight * evaluateShowdownShare(input.hero, input.board, holes);
        return;
      }
      for (const combo of ranges[index].combinations) {
        attempts++;
        if (combo.cards.some(card => used.has(card))) continue;
        visit(index + 1, [...holes, combo.cards], new Set([...used, ...combo.cards]), weight * combo.weight);
      }
    };
    visit(0, [], new Set(visible), 1);
    if (!count) throw new Error("Impossible joint ranges");
    const share = weightedShare / mass;
    return { ...metadata, status: "supported", method: "exact-river", sampleCount: count, attempts,
      showdownShare: share, standardError: 0, confidence95: [share, share] };
  }
  // Bounded feasibility search rejects small impossible ranges even away from the river.
  let nodes = 0;
  const feasible = (index: number, used: Set<string>): boolean | undefined => {
    if (index === ranges.length) return true;
    for (const combo of ranges[index].combinations) {
      if (++nodes > 100_000) return undefined;
      if (combo.cards.some(card => used.has(card))) continue;
      const result = feasible(index + 1, new Set([...used, ...combo.cards]));
      if (result !== false) return result;
    }
    return false;
  };
  if (feasible(0, new Set(visible)) === false) throw new Error("Impossible joint ranges");
  const random = seededRandom(input.seed);
  while (attempts < limit && count < input.sampleBudget) {
    attempts++;
    const holes = ranges.map(range => {
      const draw = random();
      let cumulative = 0;
      for (const combo of range.combinations) {
        cumulative += combo.weight;
        if (draw < cumulative) return combo.cards;
      }
      return range.combinations[range.combinations.length - 1].cards;
    });
    const used = new Set([...visible, ...holes.flat()]);
    if (used.size !== visible.length + holes.length * 2) continue;
    const remaining = deck.filter(card => !used.has(card));
    const missing = 5 - input.board.length;
    for (let index = 0; index < missing; index++) {
      const selected = index + Math.floor(random() * (remaining.length - index));
      [remaining[index], remaining[selected]] = [remaining[selected], remaining[index]];
    }
    const share = evaluateShowdownShare(input.hero, [...input.board, ...remaining.slice(0, missing)], holes);
    count++;
    const delta = share - mean;
    mean += delta / count;
    m2 += delta * (share - mean);
  }
  if (count < input.sampleBudget) return { ...metadata, status: "unsupported", reason: "attempt-budget-exhausted", sampleCount: count, attempts };
  // Hoeffding bound remains valid for bounded fractional shares, including zero observed variance.
  const halfWidth = Math.sqrt(Math.log(40) / (2 * count));
  return { ...metadata, status: "supported", method: "monte-carlo", sampleCount: count, attempts,
    showdownShare: mean, standardError: Math.sqrt(m2 / (count - 1) / count),
    confidence95: [Math.max(0, mean - halfWidth), Math.min(1, mean + halfWidth)] };
}
