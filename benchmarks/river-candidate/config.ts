/** v1 is immutable once freeze-v1.json exists. Changes require a new study directory/version. */
export const version = "river-candidate-v1";
export const difficulties = ["easy", "medium", "hard"] as const;
export const ranges = ["broad", "value-heavy", "polarized"] as const;
export const policies = ["rules", "call-heavy", "raising"] as const;
export const configuration = {
  version, samples: 5000, actionLimit: 100, holdingsPerRange: 16,
  developmentPerStratum: 4, confirmationPerStratum: 10,
  namespaces: { development: "river-candidate-v1/dev/9dc47", confirmation: "river-candidate-v1/confirm/e201b" },
  bootstrap: { resamples: 20000, seed: 190361, developmentConfidence: .95, confirmationConfidence: 1 - .05 / 27, comparisons: 27, method: "two-sided percentile; stratified whole independent situations; approximate coverage" },
  lines: ["flop-bet", "turn-bet"], bands: [1, 1.5, 3], orientations: [0, 1],
  support: { bigBlind: 2, preflopRaise: [4, 14], postflopBet: [3, 21], rootPot: [14, 70], effectiveSPR: [1, 1.5, 3], unequalExtraChips: [0, 12] },
  generation: "seeded rejection on visible bounds only; top-two-card straight or replicate-zero board Broadway split; rainbow/two-tone board; global suit-canonical uniqueness; exclude discovery rank/suit class; no decision-based rejection",
  rangeWeights: { broad: "1", "value-heavy": "2^categoryIndex (high-card=0,...,straight-flush=8)", polarized: "categoryIndex>=4 ? 12 : categoryIndex===0 ? 6 : 1" },
  sampling: "16 independent weighted draws with replacement from all 990 compatible holdings; same holding across arms/difficulties/policies",
  controls: {
    safeguard: "exact own visible minimum share >= actual contestable call odds => never fold (raising may continue aggressively); forced split => check/call; never fold profitable guaranteed calls",
    callHeavy: "otherwise call probability .95 if call/livePot<=.4, .80 if <=.7, .55 otherwise; fold residual; check when free",
    raising: "outside forced split: raise probability .45 with own category>=two-pair, .20 otherwise; conditional raise sizes minimum/intermediate/all-in with probabilities .40/.35/.25; intermediate=floor((min+max)/2); if no raise use call branch; remaining mass calls with probability .85/.55/.20 for call/livePot<=.4/<=.7/>.7, folds residual; free check",
    randomness: "common seed by situation/range/draw/policy, reset for each arm and difficulty; sequential public decision random uniforms",
  },
  gates: { development: "48 situations, zero failures, mechanical checks pass, every one of nine means >0, activation in all 12 strata", confirmation: "120 situations, zero failures, mechanical checks pass, every one of nine adjusted lower bounds >0; only development-qualified difficulties", rescue: "none: no extra samples, alternative candidate or post-hoc restriction" },
} as const;
export type Phase = "development" | "confirmation";
export interface Spec { id: string; phase: Phase; line: "flop-bet" | "turn-bet"; band: number; orientation: number; replicate: number; stratum: string }
export function allocation(phase: Phase): Spec[] {
  return configuration.lines.flatMap(line => configuration.bands.flatMap(band => configuration.orientations.flatMap(orientation =>
    Array.from({ length: phase === "development" ? 4 : 10 }, (_, replicate) => ({ id: `${phase}/${line}/${band}/${orientation}/${replicate}`, phase, line, band, orientation, replicate, stratum: `${line}/${band}/${orientation}` })))));
}
