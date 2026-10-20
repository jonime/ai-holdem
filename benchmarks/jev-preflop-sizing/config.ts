export const version = "jev-preflop-sizing-v1";
export const hands = ["AA", "KK"] as const;
export type Hand = typeof hands[number];
export const sizes = [4, 5, 6] as const;
export type Size = typeof sizes[number];
export type Selection = Partial<Record<Hand, Size>>;
export const opponents = ["rules", "selective", "loose"] as const;
export type Opponent = typeof opponents[number];
export const heroes = ["rules", "conservative"] as const;
export type Hero = typeof heroes[number];
export const cells = opponents.flatMap(opponent => heroes.map(hero => ({ opponent, hero, id: `${opponent}/${hero}` })));
export const combinations = ["cd", "ch", "cs", "dh", "ds", "hs"] as const;
export const handNumbers = [1, 2, 7, 16] as const;
export type Phase = "development" | "confirmation";
export interface Spec { id: string; phase: Phase; hand: Hand; combo: number; handNumber: number; replicate: number }
export function allocation(phase: Phase): Spec[] {
  return hands.flatMap(hand => combinations.flatMap((_, combo) => handNumbers.flatMap(handNumber =>
    Array.from({ length: phase === "development" ? 4 : 10 }, (_, replicate) => ({
      id: `${version}:${phase}:${hand}:${combo}:${handNumber}:${replicate}`, phase, hand, combo, handNumber, replicate,
    })))));
}
export const configuration = {
  version, seats: 2, stacks: [200, 200], blinds: [1, 2], rake: 0, roots: [200, ...sizes],
  scriptedAmounts: { 4: { callPayment: 2, raiseTo: 12, raisePayment: 10 }, 5: { callPayment: 3, raiseTo: 15, raisePayment: 13 }, 6: { callPayment: 4, raiseTo: 18, raisePayment: 16 }, 200: { callPayment: 198 } },
  equitySamples: 5000, actionLimit: 200, workers: 1, handNumbers, combinations,
  developmentPerStratum: 4, confirmationPerStratum: 10, bootstrapResamples: 20000, bootstrapSeed: 0x4a455631,
  dealSeed: "SHA-256(block ID), first UInt32LE, established LCG shuffle (1664525, 1013904223 modulo 2^32)",
  developmentConfidence: 0.95, confirmationConfidence: 1 - 0.05 / 12, plannedConfirmationComparisons: 12,
  selection: "positive paired mean in every cell, zero failures; maximize worst-cell mean; smaller size breaks ties",
  equitySeed: "block id / actor seat / street / actor decision ordinal; shared across arms and cells",
  projection: "production Rules legacy history/context/menu; equity scalar uses shared seeded 5000-sample random-opponent estimator",
  conservative: "check free; call iff equity >= contestable call odds + .05; exact river nonnegative guaranteed call/impossible call overrides; never bet/raise",
  response: "override opponent first response only; all later decisions current medium OpeningAwareEquityRulesBot",
};
