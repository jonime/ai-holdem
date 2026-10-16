import { EquityRulesV2Bot } from "@/lib/bots/equity-rules-v2";
import type { BotContext } from "@/lib/bots/types";
import type { AIDifficulty, PokerAction, PokerGameState } from "@/lib/poker/types";
import { pokerEngineAdapter as engine, createDeterministicDeck } from "@/lib/poker/adapter";
import { projectBotHistory } from "@/lib/poker/bot-history";
import { context, actionKey } from "../preflop-action-value/experiment";
import { opponentBot, type Opponent } from "../equity-rules/experiment";
import { handClasses, buildPreflopNode, preflopNodes } from "../poker-context-harness";
import { representationCases, materialize as auditFixture } from "../bot-audit/fixtures";
import { type Spec, type Fixture, opening, projectStep, materialize, base } from "./fixtures";
import { override, type Choice, type Selection, targets } from "./candidate";
export const opponents = ["frozen", "passive", "aggressive"] as const;
export const samples = 5000;
export interface BlockRow {
  spec: Spec; deckHash: string; samples: number; baseline: PokerAction;
  branch: string | null; treatment: boolean; values: Record<string, Record<string, number>>;
  uniqueRollouts: number; failure: string | null;
}
export function conserve(state: PokerGameState) {
  const view = engine.decisionView(state);
  if (view.players.reduce((s, p) => s + p.stack, 0) + (view.street === "complete" ? 0 : view.pot) !== state.config.players.reduce((s, p) => s + p.stack, 0)) throw new Error("Chip conservation failed");
}
export async function continuation(fixture: Fixture, first: PokerAction, difficulty: AIDifficulty, opponent: Opponent, equitySamples: number) {
  let state = fixture.state;
  const history = [...fixture.history], hero = new EquityRulesV2Bot(), other = opponentBot(opponent);
  const startStack = engine.decisionView(state).players.find(p => p.id === fixture.heroId)!.stack;
  for (let count = 0; count <= 200; count++) {
    if (engine.snapshot(state).street === "complete") {
      conserve(state);
      return (engine.decisionView(state).players.find(p => p.id === fixture.heroId)!.stack - startStack) / state.config.bigBlind;
    }
    if (count === 200) throw new Error("Action limit exceeded");
    const actor = engine.snapshot(state).currentActorId!;
    const input = count === 0 ? null : context(state, history, difficulty, actor === fixture.heroId || opponent === "frozen" ? equitySamples : 1);
    const action = count === 0 ? first : (await (actor === fixture.heroId ? hero : other).decide(input!)).action;
    const before = state;
    state = engine.applyAction(state, actor, action);
    conserve(state);
    history.push(projectStep(before, state, action, history.length + 1));
  }
  throw new Error("Unreachable continuation");
}
export async function evaluate(spec: Spec, selection: Selection = {}, equitySamples = samples, run: typeof continuation = continuation): Promise<BlockRow> {
  const fixture = materialize(spec), difficulty = spec.target === "medium-kk" ? "medium" : "hard";
  const input = context(fixture.state, fixture.history, difficulty, equitySamples);
  const baseline = await new EquityRulesV2Bot().decide(input);
  const choices: Choice[] = spec.phase === "screen" ? ["call", "raise3"] : selection[spec.target] ? [selection[spec.target]!] : [];
  if (!choices.length) throw new Error("No selected confirmation candidate");
  const proposals = [{ label: "baseline", decision: baseline }, ...choices.map(choice => ({ label: choice, decision: override(input, baseline, { [spec.target]: choice }) }))];
  const row: BlockRow = { spec, deckHash: fixture.deckHash, samples: equitySamples, baseline: baseline.action, branch: baseline.diagnostics.matchedRule,
    treatment: proposals.some(p => actionKey(p.decision.action) !== actionKey(baseline.action)), values: {}, uniqueRollouts: 0, failure: null };
  try {
    for (const p of proposals) engine.applyAction(fixture.state, fixture.heroId, p.decision.action);
    for (const opponent of opponents) {
      const cache = new Map<string, number>();
      row.values[opponent] = {};
      for (const p of proposals) {
        const key = actionKey(p.decision.action);
        if (!cache.has(key)) { cache.set(key, await run(fixture, p.decision.action, difficulty, opponent, equitySamples)); row.uniqueRollouts++; }
        row.values[opponent][p.label] = cache.get(key)!;
      }
    }
  } catch (error) {
    row.values = {};
    row.failure = error instanceof Error && error.message === "Action limit exceeded" ? "action_limit" : "rollout_failed";
  }
  return row;
}
export interface FixedRow { id: string; difficulty: AIDifficulty; handNumber: number; baseline: PokerAction; overrides: string[]; }
export async function fixed(equitySamples = samples) {
  const rows: FixedRow[] = [], bot = new EquityRulesV2Bot();
  async function check(id: string, f: Fixture, input?: BotContext) {
    const original = input ?? context(f.state, f.history, "medium", equitySamples);
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      const c = { ...original, difficulty }, baseline = await bot.decide(c), changed: string[] = [];
      for (const target of targets) for (const choice of ["call", "raise3"] as const) {
        const decision = override(c, baseline, { [target]: choice });
        engine.applyAction(f.state, f.heroId, decision.action);
        if (decision !== baseline) changed.push(`${target}:${choice}`);
      }
      rows.push({ id, difficulty, handNumber: c.game.handNumber, baseline: baseline.action, overrides: changed });
    }
  }
  for (const h of handClasses) await check(`class:${h.notation}`, opening(h.cards, `fixed:class:${h.notation}`));
  for (const seats of [2, 3, 4, 5, 6]) {
    const probe = engine.decisionView(engine.startHand(base(seats), createDeterministicDeck()));
    for (const position of probe.players.map(p => p.position)) for (const stackBB of [20, 100, 150]) for (const rank of ["K", "Q"]) {
      await check(`coverage:${seats}:${position}:${stackBB}:${rank}`, opening([rank + "c", rank + "d"], `fixed:${seats}:${position}:${stackBB}:${rank}`, { seats, stackBB, position }));
    }
  }
  for (const rank of ["K", "Q"]) {
    const f = opening([rank + "c", rank + "d"], `fixed:unknown:${rank}`), c = context(f.state, [], "medium", equitySamples);
    await check(`unknown:${rank}`, f, { ...c, situation: { ...c.situation!, historyStatus: "unknown" } });
    await check(`unequal:${rank}`, opening([rank + "c", rank + "d"], `fixed:unequal:${rank}`, { unequal: true }));
    for (const node of preflopNodes.filter(n => n.line !== "open")) {
      const n = buildPreflopNode(node, [rank + "c", rank + "d"], "facts", 1);
      const projected = projectBotHistory(n.history, n.state, engine.snapshot(n.state).currentActorId!);
      if (projected.status !== "complete") throw new Error("Fixed history incomplete");
      await check(`pressure:${node.id}:${rank}`, { state: n.state, heroId: engine.snapshot(n.state).currentActorId!, history: [...projected.actions], deckHash: "fixed" });
    }
  }
  for (const f of representationCases(1).filter(f => f.spec.line.length > 0)) {
    const n = auditFixture(f, "original", 1, true);
    if (engine.snapshot(n.state).street === "preflop") continue;
    const projected = projectBotHistory(n.history, n.state, engine.snapshot(n.state).currentActorId!);
    await check(`postflop:${f.id}`, { state: n.state, heroId: engine.snapshot(n.state).currentActorId!, history: [...projected.actions], deckHash: "fixed" });
  }
  for (const row of rows) if (row.overrides.length) {
    const kk = row.difficulty === "medium" && ["class:KK", "coverage:6:UTG:100:K"].includes(row.id);
    const qq = row.difficulty === "hard" && ["class:QQ", "coverage:6:UTG:100:Q"].includes(row.id);
    const target = kk ? "medium-kk" : qq ? "hard-qq" : null;
    if (!target || row.overrides.join() !== `${target}:call,${target}:raise3`) throw new Error("Out-of-domain fixed override");
  }
  return { samples: equitySamples, rows, passed: true as const };
}
