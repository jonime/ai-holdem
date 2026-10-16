import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import type { PokerAction } from "@/lib/poker/types";
import type { BotHandContext } from "@/lib/poker/bot-history";
import { projectSessionStats } from "@/lib/poker/session-stats";
import { withConfidenceOpponentAdvice } from "@/lib/poker/opponent-advice";
import { prepareProviderContext } from "@/lib/poker/provider-context";
import { inspectMenuAddition, type BettingMenu } from "@/lib/systemone/questions";
import { evaluationContext } from "../poker-context-harness";
import { recordedHistory, conditions, type Condition } from "../opponent-advice/fixtures";

export const menus = ["current", "quarter-pot", "1.5-pot"] as const satisfies readonly BettingMenu[];
export const fixtureVersion = "bet-sizing-sixteen-v1";
export function fixtures(samples = 5000, hiddenCards?: readonly string[]) {
  const cache = new Map<string, ReturnType<typeof recordedHistory>>();
  function build(seats: number, street: string, holding: number, condition: Condition, control: string | null = null) {
    const kind = condition === "omitted" ? "continuation" : condition;
    // Histories are real completed hands; reseating between hands changes stacks,
    // not ownership/controller continuity. Projection validates every replay.
    const key = `${seats}:${street}:${kind}`;
    let source = cache.get(key);
    if (!source) { source = recordedHistory(seats, street === "preflop" ? "flop" : street, 0, kind, 6); cache.set(key, source); }
    let waiting = source.state;
    const stack = control === "short" ? 3 : holding === 0 ? seats === 2 ? 40 : 100 : 400;
    for (const player of [...waiting.config.players]) {
      waiting = engine.removePlayer(waiting, player.id);
      waiting = engine.seatPlayer(waiting, { ...player, stack });
    }
    const probe = engine.startHand(waiting, createDeterministicDeck());
    const order = engine.decisionView(probe).postflopOrder;
    const heroSeat = order[0];
    const cards = holding === 0 ? ["As", "Ah"] : street === "river" ? ["7c", "6d"] : ["Js", "Ts"];
    const board = control === "safeguard" ? ["Ac", "Kc", "Qc", "Jc", "Tc"] : ["9s", "8s", "2c", "3d", "Qh"];
    const burns = ["4c", "5c", "6c"];
    const reserved = [...cards, ...board, ...burns, ...(hiddenCards ?? [])];
    const available = createDeterministicDeck().map(c => c.rank + c.suit).filter(c => !reserved.includes(c));
    const prefix = [0, 1].flatMap(round => order.map(seat => seat === heroSeat ? cards[round] : hiddenCards && seat === order[1] ? hiddenCards[round] : available.shift()!));
    prefix.push(burns[0], ...board.slice(0, 3), burns[1], board[3], burns[2], board[4]);
    let state = engine.startHand(waiting, createDeterministicDeck(prefix));
    const initialState = state, actions: BotHandContext["actions"][number][] = [];
    const apply = (action: PokerAction) => {
      actions.push({ sequence: actions.length + 1, action, stateBefore: state });
      state = engine.applyAction(state, engine.snapshot(state).currentActorId!, action);
    };
    if (!control) apply({ type: "raise", amount: 6 });
    while (engine.snapshot(state).street !== street) {
      if (actions.length > 40) throw new Error("Fixture replay bound");
      const call = engine.getLegalActions(state).find(a => a.type === "call");
      apply(call?.type === "call" ? { type: "call", amount: call.amount } : { type: "check" });
    }
    if (control === "raise") apply({ type: "bet", amount: 2 });
    const currentHand = { version: 0, handNumber: 43, initialState, actions };
    const base = evaluationContext(state, currentHand, "facts", samples);
    const stats = condition === "omitted" ? {} : { sessionStats: projectSessionStats({ gameId: "bet-sizing", version: 0, currentHand, previousHands: source.hands }, state, engine.snapshot(state).currentActorId!) };
    if (stats.sessionStats) {
      const unknown = projectSessionStats(null, state, engine.snapshot(state).currentActorId!);
      stats.sessionStats = { ...stats.sessionStats, participants: stats.sessionStats.participants.map(p => p.role === "hero" || p.seat === 0 ? p : unknown.participants.find(q => q.seat === p.seat)!) };
    }
    const context = withConfidenceOpponentAdvice({ ...base, ...stats });
    const variants = Object.fromEntries(menus.map(menu => [menu, prepareProviderContext(context, menu)])) as Record<BettingMenu, typeof context>;
    const availability = menus.map(menu => ({ menu, ...inspectMenuAddition(context, menu) }));
    if (!control && availability.slice(1).some(a => a.reason !== "available")) throw new Error(`Eligible fixture ${seats}/${street}/${holding}: ${JSON.stringify(availability)}`);
    if (control && menus.some(menu => JSON.stringify(variants[menu].sizingOptions) !== JSON.stringify(variants.current.sizingOptions))) throw new Error("Control menu changed");
    return { id: control ?? `${seats}-${street}-${holding}`, seats, street, holding, condition, control, state, currentHand, context, variants, availability };
  }
  let i = 0;
  const eligible = [2, 6].flatMap(seats => ["flop", "turn", "river"].flatMap(street => [0, 1].map(holding => build(seats, street, holding, conditions[i++ % 4]))));
  return [...eligible, build(2, "preflop", 0, "omitted", "preflop"), build(2, "flop", 0, "omitted", "raise"), build(2, "flop", 0, "omitted", "short"), build(2, "river", 1, "omitted", "safeguard")];
}
