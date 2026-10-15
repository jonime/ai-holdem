import { z } from "zod";
export const providers = ["jev", "eevo", "llm", "rules"] as const;
export type Provider = typeof providers[number];
const probabilities = z.record(z.string().regex(/^(fold|check|call|bet|raise)(?:_to_\d+)?$/), z.number().min(0).max(1)).nullable();
const sizingProbabilities = z.partialRecord(z.enum(["two_big_blinds", "two_and_half_big_blinds", "three_big_blinds", "one_third_pot", "one_half_pot", "two_thirds_pot", "full_pot", "all_in", "not_applicable"]), z.number().min(0).max(1)).nullable();
export const observationSchema = z.object({
  provider: z.enum(providers), fixture: z.string().regex(/^[a-zA-Z0-9_-]+$/), section: z.enum(["preflop", "representation"]), hand: z.string().regex(/^[AKQJT2-9]{2}[so]?$/).nullable(), weight: z.number().refine(n => [1,4,6,12].includes(n)),
  difficulty: z.enum(["easy", "medium", "hard"]), representation: z.enum(["original", "suits", "hole-order", "seats", "chips"]), mode: z.enum(["controlled", "native"]), repetition: z.number().int().min(0).max(2),
  action: z.object({ type: z.enum(["fold", "check", "call", "bet", "raise"]), amountBB: z.number().finite().nonnegative().nullable() }).strict().nullable(),
  failure: z.enum(["timeout", "network", "rate_limit", "invalid_response", "provider", "interrupted"]).nullable(), latencyMs: z.number().finite().nonnegative(),
  probabilities, sizingProbabilities, confidence: z.number().min(0).max(1).nullable(),
  policy: z.string().regex(/^[a-zA-Z0-9._-]+$/).nullable(), model: z.string().regex(/^[a-zA-Z0-9/._:-]+$/).max(160).nullable(),
  usage: z.partialRecord(z.enum(["prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens"]), z.number().finite().nonnegative()), cost: z.number().finite().nonnegative().nullable(),
  adviceItems: z.number().int().nonnegative(),
}).strict();
export type Observation = z.infer<typeof observationSchema>;
export function distribution(values: readonly string[], weights = values.map(() => 1)) {
  const counts: Record<string,number> = {}, denominator = weights.reduce((s,n) => s+n,0);
  values.forEach((v,i) => { counts[v] = (counts[v] ?? 0) + weights[i]; });
  return { denominator, frequencies: Object.fromEntries(Object.entries(counts).map(([k,v]) => [k,v / denominator])) };
}
export function tv(a: readonly string[], b: readonly string[]) {
  if (!a.length || !b.length) return null;
  const x = distribution(a).frequencies, y = distribution(b).frequencies;
  return [...new Set([...Object.keys(x),...Object.keys(y)])].reduce((s,k) => s + Math.abs((x[k] ?? 0) - (y[k] ?? 0)),0)/2;
}
const actionKey = (r: Observation) => JSON.stringify(r.action);
export function summarize(rows: readonly Observation[], expectedRepresentations: readonly { provider: Provider; difficulty: Observation["difficulty"]; mode: Observation["mode"]; fixture: string }[] = []) {
  const group = (key: (r:Observation) => string) => [...new Set(rows.map(key))].map(k => ({ key: k, rows: rows.filter(r => key(r) === k) }));
  const cells = group(r => [r.provider,r.difficulty,r.mode,r.fixture,r.representation].join(":"));
  const groups = cells.map(({ key, rows: selected }) => {
    const success = selected.filter(r => r.action && !r.failure), counts = distribution(success.map(actionKey)), p = Object.values(counts.frequencies);
    return { key, attempts: selected.length, successes: success.length, failures: selected.filter(r => r.failure).length,
      actionAndSize: counts, actionOnly: distribution(success.map(r => r.action!.type)),
      entropyBits: p.reduce((s,n) => s - n * Math.log2(n),0), repeatAgreement: success.length === 3 ? new Set(success.map(actionKey)).size === 1 : null,
      sameInputPairAgreement: success.length > 1 ? success.flatMap((r,i) => success.slice(i+1).map(q => Number(actionKey(q) === actionKey(r)))).reduce((s,n)=>s+n,0) / (success.length*(success.length-1)/2) : null,
      // Never aggregate model probabilities into empirical action frequencies.
      providerProbabilityDiagnostics: selected.map(r => ({ repetition: r.repetition, probabilities: r.probabilities, sizingProbabilities: r.sizingProbabilities, confidence: r.confidence })),
    };
  });
  const observedBases = rows.filter(r=>r.section === "representation").map(r=>({provider:r.provider,difficulty:r.difficulty,mode:r.mode,fixture:r.fixture}));
  const bases = [...new Map([...observedBases,...expectedRepresentations].map(r=>[[r.provider,r.difficulty,r.mode,r.fixture].join(":"),r])).values()];
  const contrasts = bases.flatMap(r => (["suits","hole-order","seats","chips"] as const).map(representation => {
    const selected = rows.filter(q=>q.provider===r.provider&&q.difficulty===r.difficulty&&q.mode===r.mode&&q.fixture===r.fixture);
    const original = selected.filter(q=>q.representation==="original"), variant = selected.filter(q=>q.representation===representation);
    const pairs = [0,1,2].map(repetition => [original.filter(q => q.repetition === repetition),variant.filter(q => q.repetition === repetition)]);
    const complete = pairs.filter(p => p.every(cell => cell.length === 1 && cell[0].action && !cell[0].failure)).map(p => [p[0][0],p[1][0]]);
    return { key: [r.provider,r.difficulty,r.mode,r.fixture,representation].join(":"), completePairs: complete.length, excludedPairs: 3-complete.length, totalVariation: tv(complete.map(p => actionKey(p[0])),complete.map(p => actionKey(p[1]))), changedPairs: complete.filter(p => actionKey(p[0]) !== actionKey(p[1])).length };
  }));
  const predictability = group(r => [r.provider,r.difficulty,r.mode,r.fixture.replace(/-(?:[AKQJT2-9]{2}[so]?)$/, "")].join(":"))
    .filter(g => g.rows[0].section === "preflop").map(({key,rows: selected}) => {
      const successes = selected.filter(r => r.action && !r.failure);
      const categories = (r: Observation) => r.hand?.endsWith("s") ? "suited" : r.hand?.endsWith("o") ? "offsuit" : "pairs";
      const weightedActions = distribution(successes.map(r=>r.action!.type),successes.map(r=>r.weight));
      return { key, weightedActionOnly: weightedActions,
        weightedActionEntropyBits: Object.values(weightedActions.frequencies).reduce((s,n)=>s-n*Math.log2(n),0),
        conditionalOnAction: [...new Set(successes.map(r=>r.action!.type))].map(action=>{const s=successes.filter(r=>r.action!.type===action);return {action,handClasses:distribution(s.map(r=>r.hand!),s.map(r=>r.weight)),categories:distribution(s.map(categories),s.map(r=>r.weight))};}),
        scope: selected[0].provider === "rules" ? "all_169_classes" : "conditional_on_24_selected_classes", weightedActions: distribution(successes.map(actionKey),successes.map(r=>r.weight)),
        conditionalComposition: [...new Set(successes.map(actionKey))].map(action => { const s = successes.filter(r=>actionKey(r)===action); return { action, handClasses: distribution(s.map(r=>r.hand!),s.map(r=>r.weight)), categories: distribution(s.map(categories),s.map(r=>r.weight)) }; }),
        excludedFailedObservations: selected.length-successes.length };
    });
  const operational = providers.map(provider => {
    const selected = rows.filter(r=>r.provider===provider), latency = selected.map(r=>r.latencyMs).sort((a,b)=>a-b), costs=selected.filter(r=>r.cost!==null);
    return { provider, attempts: selected.length, failures: selected.filter(r=>r.failure).length, missing: provider === "rules" ? null : 324-selected.filter(r=>r.mode==="controlled").length,
      latencyMs: { median: latency.length ? latency[Math.floor(latency.length/2)] : null, p95: latency.length ? latency[Math.min(latency.length-1,Math.floor(latency.length*.95))] : null },
      cost: { reported: costs.reduce((s,r)=>s+r.cost!,0), coveredRequests: costs.length }, usageCoveredRequests: selected.filter(r=>Object.keys(r.usage).length).length, modelIdCoveredRequests: selected.filter(r=>r.model!==null).length };
  });
  return { groups, contrasts, predictability, operational, interpretation: "Descriptive fixed decisions only. Three repetitions do not establish significance, stable mixing, exploitability, GTO accuracy or playing strength. Deterministic repeats are reproducibility checks. Incomplete pairs excluded; model probabilities are not strategic frequencies." };
}
