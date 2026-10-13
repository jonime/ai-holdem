import { createDeterministicDeck } from "../../lib/poker/adapter";

/** Mulberry32: uint32 state, fixed integer mixing, [0,1) output; seed zero is valid. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over ASCII case/hand/purpose keys; no shared stream or execution-order dependency. */
export function deriveSeed(seed: number, seats: number, hand: number, purpose: string) {
  let hash = 2166136261;
  for (const char of `${seed}/${seats}/${hand}/${purpose}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return hash;
}

/** Descending Fisher–Yates over the adapter's complete canonical deck. */
export function shuffledDeck(seed: number) {
  const random = seededRandom(seed);
  const deck = [...createDeterministicDeck()];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
