import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import type { PokerAction, PokerGameState } from "@/lib/poker/types";
import { calculateRangeEquity, type OpponentRange } from "../range-equity/calculator";
import { holdingKey, key, replay, type Decision } from "./decision";

export interface Probabilities { fold: number; call: number; raise: number }
export interface ResponseModel { version: string; provenance: string; rows: readonly { holding: readonly string[]; action: string; probabilities: Probabilities }[] }
export interface Branch { response: string; probability: number; posterior: OpponentRange; equity: number | null; enumerations: number;
  evBB: number; continuation: "fold" | "call" | null; continuationValuesBB?: { fold: number; call: number } }
export interface ActionValue { action: PokerAction; evBB: number; branches: Branch[] }
export type Evaluation = { status: "supported"; version: string; rangeProvenance: string; responseVersion: string | null;
  responseProvenance: string | null; actions: ActionValue[]; selected: PokerAction; enumerations: number } | { status: "unsupported"; reason: string };

export function terminalValue(state: PokerGameState, rootStack: number, bb: number) {
  const view = engine.decisionView(state);
  if (view.street !== "complete") throw new Error("unfinished-terminal");
  if (view.players.reduce((s, p) => s + p.stack, 0) !== state.config.players.reduce((s, p) => s + p.stack, 0)) throw new Error("chip-conservation-failed");
  return (view.players.find(p => p.id === "p0")!.stack - rootStack) / bb;
}

export function evaluate(d: Decision, range: OpponentRange, model: ResponseModel | null, candidates: readonly PokerAction[]): Evaluation {
  try {
    const equity = (r: OpponentRange) => {
      const result = calculateRangeEquity({ hero: d.hero, board: d.board, opponents: [r], seed: "river-lookahead-v1", sampleBudget: 2 });
      if (result.status !== "supported" || result.method !== "exact-river") throw new Error("exact-river-required");
      return result;
    };
    equity(range); // validates all supplied combinations, including blocked/zero entries
    const visible = [...d.hero, ...d.board];
    const raw = range.combinations.filter(c => c.weight > 0 && !c.cards.some(card => visible.includes(card)))
      .sort((a, b) => holdingKey(a.cards).localeCompare(holdingKey(b.cards)));
    const maximum = Math.max(...raw.map(c => c.weight));
    const total = raw.reduce((s, c) => s + c.weight / maximum, 0);
    const combos = raw.map(c => ({ ...c, weight: c.weight / maximum / total }));
    const runs = combos.map(c => replay(d, c.cards));
    const first = runs[0], rootStack = engine.decisionView(first.state).players.find(p => p.id === "p0")!.stack;
    const rows = new Map<string, Probabilities>();
    if (model) {
      if (!model.version.trim() || !model.provenance.trim()) throw new Error("missing-response-provenance");
      for (const row of model.rows) {
        if (row.holding.length !== 2 || new Set(row.holding).size !== 2 || row.holding.some(c => !/^[2-9TJQKA][cdhs]$/.test(c))) throw new Error("invalid-response-holding");
        const p = row.probabilities, values = [p.fold, p.call, p.raise];
        if (Object.keys(p).sort().join() !== "call,fold,raise" || values.some(v => !Number.isFinite(v) || v < 0 || v > 1) || Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 1e-12) throw new Error("invalid-response-probabilities");
        const id = `${holdingKey(row.holding)}|${row.action}`;
        if (rows.has(id)) throw new Error("duplicate-response-row");
        rows.set(id, p);
      }
    }
    if (!candidates.length) throw new Error("empty-candidates");
    const unique = [...new Map(candidates.map(a => [key(a), a])).values()];
    const actions: ActionValue[] = [];
    for (const action of unique) {
      if (!(first.kind === "checked-to" ? ["check", "bet"] : ["fold", "call"]).includes(action.type)) throw new Error("unsupported-root-action");
      const after = runs.map(r => engine.applyAction(r.state, "p0", action));
      const responses = action.type === "bet" ? ["fold", "call", "raise"] as const : ["terminal"] as const;
      const branches: Branch[] = [];
      for (const response of responses) {
        const weighted = combos.map(c => {
          const p = action.type === "bet" ? rows.get(`${holdingKey(c.cards)}|${key(action)}`) : null;
          if (action.type === "bet" && !p) throw new Error("missing-holding-and-size-response");
          return { ...c, weight: c.weight * (response === "terminal" ? 1 : p![response]) };
        });
        const probability = weighted.reduce((s, c) => s + c.weight, 0);
        if (weighted.some((c, i) => combos[i].weight > 0 && c.weight === 0 && response !== "terminal" && rows.get(`${holdingKey(c.cards)}|${key(action)}`)![response] > 0)) throw new Error("response-weight-underflow");
        if (probability === 0) continue;
        const posterior: OpponentRange = { provenance: `${range.provenance}/${model?.version ?? "showdown"}/${key(action)}/${response}`, combinations: weighted.filter(c => c.weight > 0).map(c => ({ cards: c.cards, weight: c.weight / probability })) };
        const showdown = response !== "fold" && action.type !== "fold";
        const eq = showdown ? equity(posterior) : null;
        let fold = 0, call = 0, value = 0;
        for (const [i, c] of weighted.entries()) {
          if (c.weight === 0) continue;
          let end = after[i];
          if (response === "raise") {
            const raise = engine.getLegalActions(end).find(a => a.type === "raise");
            if (!raise || raise.type !== "raise") throw new Error("positive-illegal-all-in-raise");
            end = engine.applyAction(end, "p1", { type: "raise", amount: raise.maxAmount });
            if (!engine.decisionView(end).players.find(p => p.id === "p1")!.allIn) throw new Error("non-all-in-raise");
            fold += c.weight / probability * terminalValue(engine.applyAction(end, "p0", { type: "fold" }), rootStack, d.bigBlind);
            call += c.weight / probability * terminalValue(engine.applyAction(end, "p0", { type: "call" }), rootStack, d.bigBlind);
          } else {
            if (response !== "terminal") end = engine.applyAction(end, "p1", { type: response });
            value += c.weight / probability * terminalValue(end, rootStack, d.bigBlind);
          }
        }
        const continuation = response === "raise" ? (call >= fold ? "call" : "fold") : null;
        branches.push({ response, probability, posterior, equity: eq?.showdownShare ?? null, enumerations: eq?.sampleCount ?? 0,
          evBB: response === "raise" ? Math.max(fold, call) : value, continuation,
          ...(response === "raise" ? { continuationValuesBB: { fold, call } } : {}) });
      }
      if (Math.abs(branches.reduce((s, b) => s + b.probability, 0) - 1) > 1e-10) throw new Error("branch-mass-not-one");
      actions.push({ action, evBB: branches.reduce((s, b) => s + b.probability * b.evBB, 0), branches });
    }
    const selected = [...actions].sort((a, b) => b.evBB - a.evBB || key(a.action).localeCompare(key(b.action)))[0].action;
    return { status: "supported", version: "river-lookahead-v1", rangeProvenance: range.provenance, responseVersion: model?.version ?? null,
      responseProvenance: model?.provenance ?? null, actions, selected, enumerations: actions.reduce((s, a) => s + a.branches.reduce((n, b) => n + b.enumerations, 0), 0) };
  } catch (error) { return { status: "unsupported", reason: error instanceof Error ? error.message : "invalid-input" }; }
}
