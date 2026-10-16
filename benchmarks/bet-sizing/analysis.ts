import { rowSchema, screening, type Row } from "./experiment";
import { menus } from "./fixtures";
import { providers } from "./providers";
const counts = (values: readonly string[]) => Object.fromEntries([...new Set(values)].map(v => [v, values.filter(x => x === v).length]));
const mean = (values: readonly (number | null)[]) => { const xs = values.filter((x): x is number => x !== null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
export function analyze(input: readonly unknown[]) {
  const rows = input.map(r => rowSchema.parse(r));
  if (new Set(rows.map(r => r.id)).size !== rows.length || new Set(rows.map(r => `${r.provider}:${r.fixture}:${r.menu}:${r.repetition}`)).size !== rows.length) throw new Error("Duplicate evidence");
  const fixtureIds = [...new Set(rows.map(r => r.fixture))];
  const summaries = (selected: Row[]) => {
    const latencies = selected.map(r => r.latencyMs).sort((a, b) => a - b);
    const good = selected.filter(r => !r.failure && r.action), costs = selected.filter(r => r.cost !== null);
    return { attempts: selected.length, successes: good.length, failures: counts(selected.flatMap(r => r.failure ? [r.failure] : [])), availability: counts(selected.map(r => r.omission)), addedSelections: good.filter(r => r.addedSelected).length,
      actions: counts(good.map(r => r.action!.type)), exactSizes: counts(good.map(r => `${r.action!.type}:${r.sizing ?? "none"}:${"amount" in r.action! ? r.action!.amount : 0}`)),
      meanPayment: mean(good.map(r => r.payment)), meanPotFraction: mean(good.map(r => r.potFraction)), meanEffectiveStackFraction: mean(good.map(r => r.stackFraction)), meanLatencyMs: mean(latencies), medianLatencyMs: latencies[Math.floor(latencies.length * 0.5)] ?? null, p95LatencyMs: latencies[Math.floor(latencies.length * 0.95)] ?? null, costCoverage: costs.length, reportedCost: costs.length ? costs.reduce((s, r) => s + r.cost!, 0) : null };
  };
  const cells = providers.flatMap(provider => fixtureIds.flatMap(fixture => menus.map(menu => ({ provider, fixture, menu, control: rows.find(r => r.fixture === fixture)!.control, ...summaries(rows.filter(r => r.provider === provider && r.fixture === fixture && r.menu === menu)) }))));
  const contrasts = providers.flatMap(provider => fixtureIds.flatMap(fixture => menus.slice(1).map(menu => {
    const blocks = Array.from({ length: 10 }, (_, repetition) => menus.map(m => rows.find(r => r.provider === provider && r.fixture === fixture && r.repetition === repetition && r.menu === m)));
    const complete = blocks.filter((b): b is [Row, Row, Row] => b.every(r => !!r && !r.failure && !!r.action));
    const pairs = complete.map(b => [b[0], b.find(r => r.menu === menu)!]);
    return { provider, fixture, menu, control: rows.find(r => r.fixture === fixture)!.control, completeBlocks: complete.length, excludedBlocks: 10 - complete.length,
      baseline: summaries(pairs.map(p => p[0])), challenger: summaries(pairs.map(p => p[1])),
      actionChangedPairs: pairs.filter(([a, b]) => a.action!.type !== b.action!.type).length,
      actionOrSizeChangedPairs: pairs.filter(([a, b]) => JSON.stringify(a.action) !== JSON.stringify(b.action)).length,
      transitions: counts(pairs.map(([a, b]) => `${a.action!.type}:${a.sizing ?? "none"}->${b.action!.type}:${b.sizing ?? "none"}`)),
      meanPaymentChange: mean(pairs.map(([a, b]) => b.payment! - a.payment!)), meanPotFractionChange: mean(pairs.map(([a, b]) => b.potFraction! - a.potFraction!)),
      meanStackFractionChange: mean(pairs.map(([a, b]) => a.stackFraction === null || b.stackFraction === null ? null : b.stackFraction - a.stackFraction)) };
  })));
  const pilotComplete = rows.length === 960 && fixtureIds.length === 16 && rows.every(r => !r.failure) && contrasts.every(c => c.completeBlocks === 10);
  const shortlist = providers.flatMap(provider => menus.slice(1).map(menu => {
    const qualifiedFixtures = cells.filter(c => c.provider === provider && c.menu === menu && !c.control && c.addedSelections >= screening.minimumSelections).map(c => c.fixture);
    return { provider, menu, qualifiedFixtures, eligibleForMatchStudy: pilotComplete && qualifiedFixtures.length >= screening.minimumFixtures };
  }));
  return { screening, pilotComplete, observedRows: rows.length, missingRows: 960 - rows.length, cells, contrasts,
    aggregates: providers.flatMap(provider => menus.map(menu => ({ provider, menu, ...summaries(rows.filter(r => r.provider === provider && r.menu === menu)) }))),
    matchedAggregates: providers.flatMap(provider => menus.slice(1).flatMap(menu => [false, true].map(control => {
      const selected = contrasts.filter(c => c.provider === provider && c.menu === menu && c.control === control);
      const transitions: Record<string, number> = {};
      for (const c of selected) for (const [key, count] of Object.entries(c.transitions)) transitions[key] = (transitions[key] ?? 0) + count;
      const completeBlocks = selected.reduce((n, c) => n + c.completeBlocks, 0);
      const weighted = (field: "meanPaymentChange" | "meanPotFractionChange" | "meanStackFractionChange") => {
        const included = selected.filter(c => c[field] !== null);
        const denominator = included.reduce((n, c) => n + c.completeBlocks, 0);
        return denominator ? included.reduce((n, c) => n + c[field]! * c.completeBlocks, 0) / denominator : null;
      };
      return { provider, menu, control, completeBlocks, excludedBlocks: selected.reduce((n, c) => n + c.excludedBlocks, 0), transitions,
        meanPaymentChange: weighted("meanPaymentChange"), meanPotFractionChange: weighted("meanPotFractionChange"), meanStackFractionChange: weighted("meanStackFractionChange") };
    }))),
    shortlist, interpretation: "Fixed-decision behavior only; transitions are paired diagnostic observations, not causal individual substitutions or EV. Provider probabilities are not betting frequencies. Eevo has offline compatibility only. Promotion requires a separately authorized paired-match study." };
}
