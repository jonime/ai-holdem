import { randomSource } from "../equity-rules/experiment";
import { cells, hands, sizes, allocation, configuration, type Phase, type Selection } from "./config";
import type { Row } from "./experiment";
export function complete(rows: readonly Row[], phase: Phase, hand: string) {
  const expected = allocation(phase).filter(s => s.hand === hand);
  return rows.length === expected.length && expected.every(s => rows.filter(r => JSON.stringify(r.spec) === JSON.stringify(s) && !r.failure).length === 1);
}
export function interval(rows: readonly Row[], cell: string, root: number, confidence: number, repetitions = 20000) {
  const strata = new Map<string, number[]>();
  for (const row of rows.filter(r => !r.failure)) {
    const key = `${row.spec.combo}:${row.spec.handNumber}`, values = strata.get(key) ?? [];
    values.push(row.outcomes[cell][root].valueBB - row.outcomes[cell][200].valueBB); strata.set(key, values);
  }
  if (strata.size !== 24) return null;
  const groups = [...strata.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, values]) => values);
  const mean = groups.reduce((s, g) => s + g.reduce((a, b) => a + b, 0) / g.length, 0) / 24;
  // Identical block-index stream in each comparison preserves pairing across arms/cells.
  const random = randomSource(configuration.bootstrapSeed), means: number[] = [];
  for (let n = 0; n < repetitions; n++) {
    let sum = 0;
    for (const group of groups) { let subtotal = 0; for (let i = 0; i < group.length; i++) subtotal += group[Math.floor(random() * group.length)]; sum += subtotal / group.length; }
    means.push(sum / 24);
  }
  means.sort((a, b) => a - b);
  const tail = (1 - confidence) / 2;
  return { meanBB: mean, lowerBB: means[Math.floor(repetitions * tail)], upperBB: means[Math.min(repetitions - 1, Math.ceil(repetitions * (1 - tail)) - 1)], confidence, repetitions,
    worstPairedBB: Math.min(...groups.flat()), strataCounts: groups.map(g => g.length) };
}
export function select(rows: readonly Row[]): Selection {
  const result: Selection = {};
  for (const hand of hands) {
    const block = rows.filter(r => r.spec.hand === hand);
    if (!complete(block, "development", hand)) continue;
    let best = -Infinity;
    for (const size of sizes) {
      const means = cells.map(cell => block.reduce((s, r) => s + r.outcomes[cell.id][size].valueBB - r.outcomes[cell.id][200].valueBB, 0) / block.length);
      const worst = Math.min(...means);
      if (worst > 0 && worst > best) { best = worst; result[hand] = size; }
    }
  }
  return result;
}
export function analyze(rows: readonly Row[], phase: Phase, selection: Selection, repetitions = 20000) {
  return hands.map(hand => {
    const block = rows.filter(r => r.spec.hand === hand), good = block.filter(r => !r.failure);
    const roots = phase === "development" ? [...sizes] : selection[hand] ? [selection[hand]!] : [];
    const comparisons = cells.flatMap(cell => roots.map(root => ({ cell: cell.id, root, interval: interval(block, cell.id, root, phase === "development" ? .95 : 1 - .05 / 12, repetitions) })));
    return { hand, blocks: block.length, complete: complete(block, phase, hand), failures: block.filter(r => r.failure).map(r => ({ id: r.spec.id, failure: r.failure, failedArm: r.failedArm })), comparisons,
      metrics: cells.flatMap(cell => [200, ...roots].map(root => {
        const outcomes = good.map(r => r.outcomes[cell.id][root]);
        const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
        return { cell: cell.id, root, blocks: outcomes.length,
          rootResponses: outcomes.reduce<Record<string, number>>((counts, o) => { counts[o.rootResponse] = (counts[o.rootResponse] ?? 0) + 1; return counts; }, {}),
          rootResponseFrequencies: outcomes.reduce<Record<string, number>>((frequencies, o) => { frequencies[o.rootResponse] = (frequencies[o.rootResponse] ?? 0) + 1 / outcomes.length; return frequencies; }, {}),
          flopFrequency: mean(outcomes.map(o => +o.flop)), showdownFrequency: mean(outcomes.map(o => +o.showdown)),
          heroLaterChips: mean(outcomes.map(o => o.heroLaterChips)), opponentLaterChips: mean(outcomes.map(o => o.opponentLaterChips)),
          meanReturnBB: mean(outcomes.map(o => o.valueBB)), worstReturnBB: outcomes.length ? Math.min(...outcomes.map(o => o.valueBB)) : null };
      })),
      conclusion: phase === "confirmation" && roots.length === 1 && complete(block, phase, hand) && comparisons.length === 6 && comparisons.every(c => c.interval && c.interval.lowerBB > 0)
        ? "shortlist-for-separate-Jev-plan" : "defer",
    };
  });
}
