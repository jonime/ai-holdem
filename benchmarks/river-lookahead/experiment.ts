import { OpeningAwareEquityRulesBot } from "@/lib/bots/equity-rules-opening";
import { candidates, contexts, key, replay } from "./decision";
import { evaluate, type Evaluation } from "./evaluator";
import type { Fixture } from "./fixtures";
import type { PokerAction } from "@/lib/poker/types";

export async function experiment(fixtures: Fixture[], smoke: boolean) {
  const baselines: { fixture: string; difficulty: string; action: PokerAction; context: ReturnType<typeof contexts>["baseline"] }[] = [];
  const rows: { fixture: string; difficulty: string; assumption: string; baseline: PokerAction; result: Extract<Evaluation, { status: "supported" }>; improvementBB: number }[] = [];
  const unsupported: { fixture: string; reason: string }[] = [];
  for (const fixture of smoke ? fixtures.slice(0, 1) : fixtures) {
    const run = replay(fixture.decision, fixture.actualOpponent);
    for (const difficulty of smoke ? ["medium"] as const : ["easy", "medium", "hard"] as const) {
      const context = contexts(run, difficulty).baseline;
      const baseline = (await new OpeningAwareEquityRulesBot().decide(context)).action;
      baselines.push({ fixture: fixture.id, difficulty, action: baseline, context });
      const actions = candidates(run, baseline, difficulty);
      for (const range of smoke ? fixture.ranges.slice(0, 1) : fixture.ranges) for (const model of fixture.models.length ? (smoke ? fixture.models.slice(0, 1) : fixture.models) : [null]) {
        const result = evaluate(fixture.decision, range, model, actions);
        if (result.status === "unsupported") { unsupported.push({ fixture: fixture.id, reason: result.reason }); continue; }
        const selected = result.actions.find(a => key(a.action) === key(result.selected))!;
        const control = result.actions.find(a => key(a.action) === key(baseline))!;
        rows.push({ fixture: fixture.id, difficulty, assumption: `${range.provenance}/${model?.version ?? "observed-all-in"}`,
          baseline, result, improvementBB: selected.evBB - control.evBB });
      }
    }
  }
  if (unsupported.length) throw new Error(`Validation failures: ${JSON.stringify(unsupported)}`);
  const cross = rows.flatMap(source => rows.filter(target => source.fixture === target.fixture && source.difficulty === target.difficulty).map(target => {
    const action = target.result.actions.find(a => key(a.action) === key(source.result.selected))!;
    const best = target.result.actions.find(a => key(a.action) === key(target.result.selected))!;
    const baseline = target.result.actions.find(a => key(a.action) === key(target.baseline))!;
    return { fixture: source.fixture, difficulty: source.difficulty, selectedUnder: source.assumption, evaluatedUnder: target.assumption,
      action: source.result.selected, evBB: action.evBB, regretBB: best.evBB - action.evBB, versusRulesBB: action.evBB - baseline.evBB };
  }));
  const robust = baselines.map(b => {
    const group = rows.filter(r => r.fixture === b.fixture && r.difficulty === b.difficulty);
    return { fixture: b.fixture, difficulty: b.difficulty, actions: group[0].result.actions.flatMap(a => {
      const differences = group.map(r => r.result.actions.find(v => key(v.action) === key(a.action))!.evBB - r.result.actions.find(v => key(v.action) === key(b.action))!.evBB);
      return Math.min(...differences) > 1e-9 ? [{ action: a.action, minimumImprovementBB: Math.min(...differences), maximumImprovementBB: Math.max(...differences) }] : [];
    }), rankings: new Set(group.map(r => r.result.actions.slice().sort((a,b) => b.evBB-a.evBB || key(a.action).localeCompare(key(b.action))).map(a => key(a.action)).join(","))).size };
  });
  return { baselines, rows, cross, robust, unsupported, validationFailures: 0, enumerations: rows.reduce((s,r) => s+r.result.enumerations,0) };
}
export function report(e: Awaited<ReturnType<typeof experiment>> & { runtimeMs: number; manifestHash: string; node: string }) {
  return `# Restricted river lookahead v1\n\nManifest SHA-256: ${e.manifestHash}. Node ${e.node}; poker-engine 1.0.1.\n\nThis is a **root-action comparison** against production OpeningAwareEquityRulesBot at its default budget, with the same posterior-optimal fold/call continuation for all roots. It is not a simulation of the complete Rules policy.\n\n${e.baselines.length} baseline decisions reused across ${e.rows.length} assumption combinations. Runtime ${(e.runtimeMs/1000).toFixed(2)} seconds; ${e.enumerations} conditional holding enumerations (repeated across actions/branches); ${e.unsupported.length} unsupported cases; ${e.validationFailures} validation failures. Zero-mass branches are absent.\n\n${e.rows.filter(r => r.improvementBB > 1e-9).length} combinations improve on the baseline; mean conditional improvement ${(e.rows.reduce((s,r) => s+r.improvementBB,0)/e.rows.length).toFixed(4)} BB. Maximum cross-assumption regret ${Math.max(...e.cross.map(c=>c.regretBB)).toFixed(4)} BB; worst selected-action difference from Rules ${Math.min(...e.cross.map(c=>c.versusRulesBB)).toFixed(4)} BB.\n\n| Fixture | Difficulty | Distinct rankings | Actions strictly improving across every supplied assumption (minimum BB) |\n|---|---|---:|---|\n${e.robust.map(r=>`| ${r.fixture} | ${r.difficulty} | ${r.rankings} | ${r.actions.map(a=>`${key(a.action)} (${a.minimumImprovementBB.toFixed(4)})`).join("; ") || "None; no robust strict improvement established"} |`).join("\n")}\n\nThe machine-readable evidence contains every baseline context, branch posterior/probability/equity, continuation alternatives, action EV and complete cross-assumption matrix. Distinct rankings and negative cross-assumption differences identify decisions requiring better opponent information. See README for synthetic construction and reproduction.\n\nThese original ranges and responses are synthetic post-line hypotheses, not inferred player behavior. Only check/bet and facing-all-in roots are covered; raises are restricted to opponent all-in, with optimal hero fold/call. Decisions are fixed rivers, with no rake or side pots. Effective stacks, ties and refunds use engine terminal payouts. Prior contributions are sunk. No measured provider or real-world playing-strength improvement is established. Exact enumeration removes sampling error conditional on assumptions; opponent uncertainty remains. Sensitivity spans are not confidence intervals, GTO values or exploitability measurements. No paid calls or production strategy/provider changes occurred. Jev, Eevo, LLM integration and live evaluations require a separate evidence-based plan.\n`;
}
