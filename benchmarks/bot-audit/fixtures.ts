import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { projectSessionStats } from "@/lib/poker/session-stats";
import type { BotContext } from "@/lib/bots/types";
import type { BotHandContext } from "@/lib/poker/bot-history";
import type { PokerAction, PokerGameState, PokerPlayerConfig } from "@/lib/poker/types";
import { evaluationContext, buildPreflopNode, handClasses, preflopNodes } from "../poker-context-harness";
import { recordedHistory } from "../opponent-advice/fixtures";
import { replay, specFromHistory, type ReplaySpec } from "./replay-adapter";
import { mapping, transform, remapStats, representations, type Representation } from "./transform";
export const version = "production-bot-audit-v1";
export const selectedHands = "AA KK QQ JJ 88 22 AKs AQs AJs ATs A5s KQs QJs JTs AKo AQo AJo ATo A5o KQo KJo QJo JTo 72o".split(" ");
export interface AuditCase { id: string; section: "preflop" | "representation"; hand: string | null; weight: number; spec: ReplaySpec; context: BotContext; stats: BotContext["sessionStats"] }
export function preflopCases(samples = 5000): AuditCase[] {
  return preflopNodes.filter(n => n.seats === 2).flatMap(node => handClasses.filter(h => selectedHands.includes(h.notation)).map(h => {
    const f = buildPreflopNode(node, h.cards, "facts", samples);
    const id = `${node.id}-${h.notation}`;
    return { id, section: "preflop", hand: h.notation, weight: h.weight, spec: specFromHistory(id, f.state, f.history), context: f.context, stats: undefined };
  }));
}
// Synthetic recorded identities are converted consistently across every replay
// state. Retain previous-owner discontinuities for insufficient-observation cases.
function botPlayer(p: PokerPlayerConfig): PokerPlayerConfig {
  return { ...p, controller: "bot", playerToken: null,
    bot: { id: p.playerToken ?? `fixture-${p.seat}`, label: "Synthetic", provider: "rules", modelId: null }, aiDifficulty: "medium" };
}
export function botHistory(h: BotHandContext): BotHandContext {
  const convert=(state: PokerGameState | null | undefined)=>state ? { ...state, config: { ...state.config, players: state.config.players.map(botPlayer) } } : null;
  return { ...h, initialState:convert(h.initialState), finalState:convert(h.finalState), actions:h.actions.map(a=>({...a,stateBefore:convert(a.stateBefore)})) };
}
const definitions = [
  { id: "HU-open-suited", seats: 2, street: "preflop", hole: ["As", "5s"], observation: "folding" },
  { id: "HU-defend-offsuit", seats: 2, street: "preflop", hole: ["Kh", "Jd"], facing: "open", observation: "omitted" },
  { id: "HU-flop-draw", seats: 2, street: "flop", hole: ["Js", "Ts"], observation: "folding" },
  { id: "HU-flop-paired-kicker", seats: 2, street: "flop", hole: ["As", "Qh"], paired: true, facing: "bet", observation: "insufficient" },
  { id: "HU-turn-capped-call", seats: 2, street: "turn", hole: ["Js", "Ts"], facing: "capped", observation: "omitted" },
  { id: "HU-river-board-split", seats: 2, street: "river", hole: ["7d", "2h"], royal: true, facing: "shove", observation: "folding" },
  { id: "3-preflop-suited", seats: 3, street: "preflop", hole: ["Ks", "Qs"], observation: "insufficient" },
  { id: "6-preflop-offsuit", seats: 6, street: "preflop", hole: ["Ah", "Td"], observation: "folding" },
  { id: "3-flop-draw", seats: 3, street: "flop", hole: ["Js", "Ts"], observation: "folding" },
  { id: "6-flop-paired", seats: 6, street: "flop", hole: ["As", "Qh"], paired: true, observation: "omitted" },
  { id: "4-turn-draw", seats: 4, street: "turn", hole: ["Js", "Ts"], observation: "insufficient" },
  { id: "5-river-board-kicker", seats: 5, street: "river", hole: ["3d", "3h"], quads: true, observation: "folding" },
] as const;
export function representationCases(samples = 5000): AuditCase[] {
  return definitions.map(d => {
    const config = { smallBlind: 60, bigBlind: 120, seatCount: d.seats, players: Array.from({ length: d.seats }, (_, seat) => ({ id: `p${seat}`, name: "Synthetic", controller: "bot" as const, aiDifficulty: "medium" as const, bot: { id: `fixture-${seat}`, label: "Synthetic", provider: "rules" as const, modelId: null }, playerToken: `fixture-${seat}`, seat, stack: "facing" in d && d.facing === "capped" && seat === 0 ? 600 : 12000 })) };
    const probe = engine.startHand(engine.createGame(config), createDeterministicDeck()), view = engine.decisionView(probe);
    const hero = "facing" in d ? (d.street === "preflop" ? view.bigBlindSeat : view.postflopOrder[1]) : (d.street === "preflop" ? view.preflopOrder[0] : view.postflopOrder[0]);
    const board = "royal" in d ? ["As", "Ks", "Qs", "Js", "Ts"] : "quads" in d ? ["2s", "2h", "2d", "2c", "3s"] : "paired" in d ? ["Kd", "Kh", "4c", "8s", "2d"] : ["9s", "8s", "2c", "3d", "Qh"];
    const burns = ["4d", "5c", "6c"];
    const available = createDeterministicDeck().map(c => c.rank + c.suit).filter(c => ![...d.hole, ...board, ...burns].includes(c));
    const prefix = [0, 1].flatMap(round => view.postflopOrder.map(seat => seat === hero ? d.hole[round] : available.shift()!));
    prefix.push(burns[0], ...board.slice(0, 3), burns[1], board[3], burns[2], board[4]);
    const deck = createDeterministicDeck(prefix).map(c => c.rank + c.suit);
    const spec: ReplaySpec = { id: d.id, config, button: view.buttonSeat, handNumber: 43, deck, line: [] };
    let f = replay(spec);
    const line: { seat: number; action: PokerAction }[] = [];
    while (engine.snapshot(f.state).street !== d.street) {
      const v = engine.decisionView(f.state), call = engine.getLegalActions(f.state).find(a => a.type === "call");
      line.push({ seat: v.currentActorSeat!, action: call ? { type: "call", amount: call.amount } : { type: "check" } });
      f = replay({ ...spec, line });
      if (line.length > 40) throw new Error("Fixture street unreachable");
    }
    if ("facing" in d) {
      const v = engine.decisionView(f.state), opponent = v.players.find(p => p.seat === v.currentActorSeat)!;
      line.push({ seat: opponent.seat, action: d.facing === "open" ? { type: "raise", amount: 360 } : { type: "bet", amount: d.facing === "bet" ? 240 : d.facing === "capped" ? 6000 : opponent.stack } });
      f = replay({ ...spec, line });
    }
    if (engine.decisionView(f.state).currentActorSeat !== hero) throw new Error("Fixture hero mismatch");
    const target = view.postflopOrder.find(seat => seat !== hero)!;
    const context = evaluationContext(f.state, f.history, "facts", samples);
    let stats: BotContext["sessionStats"];
    if (d.observation !== "omitted") {
      const source = recordedHistory(d.seats, d.street, target, d.observation, 6);
      stats = projectSessionStats({ gameId: "synthetic-audit", version: 0, currentHand: f.history, previousHands: source.hands.map(botHistory) }, f.state, engine.snapshot(f.state).currentActorId!);
    }
    return { id: d.id, section: "representation", hand: null, weight: 1, spec: { ...spec, line }, context: { ...context, ...(stats ? { sessionStats: stats } : {}) }, stats };
  });
}
export function materialize(f: AuditCase, representation: Representation, samples = 5000, rules = false) {
  const m = mapping(f.spec, representation), hero = f.context.hero.seat;
  const spec = transform(f.spec, hero, m), built = replay(spec);
  const base = evaluationContext(built.state, built.history, "facts", samples, rules);
  const stats = remapStats(f.stats, m);
  const native: BotContext = { ...base, ...(stats ? { sessionStats: stats } : {}) };
  // Only this scalar is substituted. Facts/advice/menus are recomputed by production wrappers.
  const controlled = { ...native, analysis: { ...native.analysis, showdownEquity: f.context.analysis.showdownEquity, equitySamples: f.context.analysis.equitySamples } };
  return { ...built, mapping: m, native, controlled, representation };
}
export { handClasses, preflopNodes, representations };
