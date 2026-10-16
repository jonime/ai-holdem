import type { BlockRow } from "./experiment";
import { opponents } from "./experiment";
import { targets, type Target, type Choice, type Selection } from "./candidate";
import { randomSource } from "../equity-rules/experiment";
export function interval(rows: readonly BlockRow[], opponent: string, choice: string, confidence = 0.95, repetitions = 20000) {
  const complete = rows.filter(r => !r.failure), strata = new Map<string, number[]>();
  for (const row of complete) {
    const key = `${row.spec.combo}:${row.spec.handNumber}`, values = strata.get(key) ?? [];
    values.push(row.values[opponent][choice] - row.values[opponent].baseline); strata.set(key, values);
  }
  if (strata.size !== 24 || rows.length === 0 || repetitions < 1) return null;
  const groups = [...strata.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, values]) => values);
  const meanBB = groups.reduce((sum, g) => sum + g.reduce((a, b) => a + b, 0) / g.length, 0) / 24;
  const random = randomSource(93571), means: number[] = [];
  for (let n = 0; n < repetitions; n++) {
    let sum = 0;
    for (const g of groups) { let subtotal = 0; for (let i = 0; i < g.length; i++) subtotal += g[Math.floor(random() * g.length)]; sum += subtotal / g.length; }
    means.push(sum / 24);
  }
  means.sort((a, b) => a - b);
  const tail = (1 - confidence) / 2;
  return { meanBB, lower: means[Math.floor(repetitions * tail)], upper: means[Math.min(repetitions - 1, Math.ceil(repetitions * (1 - tail)) - 1)], confidence, repetitions, complete: complete.length, strataCounts: groups.map(g => g.length) };
}
export function analyze(rows: readonly BlockRow[], phase: "screen" | "confirm", selection: Selection = {}, repetitions = 20000) {
  const confidence = phase === "screen" ? 0.95 : 1 - 0.05 / 6;
  return targets.map(target => {
    const block = rows.filter(r => r.spec.target === target);
    const choices: Choice[] = phase === "screen" ? ["call", "raise3"] : selection[target] ? [selection[target]!] : [];
    return { target, attempted: block.length, excluded: block.filter(r => r.failure).map(r => ({ id: r.spec.id, failure: r.failure })), treated: block.filter(r => r.treatment).length,
      baselineFrequencies: block.reduce<Record<string, number>>((counts, r) => { const key = JSON.stringify(r.baseline); counts[key] = (counts[key] ?? 0) + 1; return counts; }, {}),
      choices: Object.fromEntries(choices.map(choice => [choice, Object.fromEntries(opponents.map(opponent => [opponent, interval(block, opponent, choice, confidence, repetitions)]))])) };
  });
}
export function select(rows: readonly BlockRow[], fixedPassed: boolean, repetitions = 20000): Selection {
  if (!fixedPassed) return {};
  const selected: Selection = {};
  for (const target of analyze(rows, "screen", {}, repetitions)) {
    if (target.attempted !== 96 || target.excluded.length) continue;
    let best = -Infinity;
    for (const choice of ["call", "raise3"] as const) {
      const intervals = Object.values(target.choices[choice]);
      if (intervals.some(i => !i || i.lower <= 0)) continue;
      const worst = Math.min(...intervals.map(i => i!.lower));
      if (worst > best) { best = worst; selected[target.target] = choice; }
    }
  }
  return selected;
}
export function verdict(rows: readonly BlockRow[], selection: Selection, fixedPassed: boolean, repetitions = 20000) {
  return Object.fromEntries(analyze(rows, "confirm", selection, repetitions).map(t => [t.target,
    fixedPassed && t.attempted === 240 && t.excluded.length === 0 && Object.keys(t.choices).length === 1 && Object.values(t.choices).every(o => Object.values(o).every(i => i && i.lower > 0)) ? "confirmed-conditional-value" : "defer"]));
}
export const targetMetadata: Record<Target, { hand: string; difficulty: string }> = { "medium-kk": { hand: "KK", difficulty: "medium" }, "hard-qq": { hand: "QQ", difficulty: "hard" } };
