import "server-only";
import { isDeepStrictEqual } from "node:util";
import { pokerEngineAdapter as engine } from "./adapter";
import { BotHistoryConflictError, projectBotHistory, type BotHandContext } from "./bot-history";
import { PokerRuleError, type PokerGameState, type PokerPlayerConfig } from "./types";

export const sessionStatsVersion = "poker-session-stats-v1";
export interface BotSessionContext {
  readonly gameId: string;
  readonly version: number;
  readonly currentHand: BotHandContext | null;
  readonly previousHands: readonly BotHandContext[];
}
const metricNames = ["vpip", "preflopRaise", "buttonOpenRaise", "buttonLimp", "buttonFold",
  "bbSmallOpenFold", "bbSmallOpenCall", "bbSmallOpenRaise", "bbLargeOpenFold", "bbLargeOpenCall", "bbLargeOpenRaise",
  "flopAggression", "flopFoldFacingBet", "turnAggression", "turnFoldFacingBet", "riverAggression", "riverFoldFacingBet"] as const;
type Metric = typeof metricNames[number];
type Counts = Record<Metric, { count: number; opportunities: number }>;
export interface Observation {
  readonly count: number;
  readonly opportunities: number;
  readonly rate: number | null;
  readonly evidence: "unknown" | "insufficient" | "observed";
}
export interface BotSessionStats {
  readonly version: typeof sessionStatsVersion;
  readonly coverage: { readonly status: "complete" | "incomplete"; readonly selectedHands: number; readonly validatedHands: number; readonly excludedHands: number; readonly window: 50 };
  readonly participants: readonly {
    readonly seat: number;
    readonly role: "hero" | "opponent";
    readonly headsUp: Readonly<Record<Metric, Observation>>;
    readonly multiway: Readonly<Record<Metric, Observation>>;
  }[];
}

/** Internal continuity key. Never placed in provider context, logs, or public DTOs. */
function identity(player: PokerPlayerConfig | undefined): unknown | null {
  if (!player) return null;
  if (player.controller === "human") return player.playerToken
    ? [player.id, "human", player.playerToken] : null;
  // Legacy/missing bot configurations cannot establish continuity.
  if (!player.bot || (player.bot.provider === "llm" ? !player.botProfileId : !player.aiDifficulty)) return null;
  return [player.id, "bot", player.bot,
    player.aiDifficulty ?? null, player.botProfileId ?? null];
}
function counts(): Counts {
  return Object.fromEntries(metricNames.map(key => [key, { count: 0, opportunities: 0 }])) as Counts;
}
function observations(input: Counts): Record<Metric, Observation> {
  return Object.fromEntries(metricNames.map(key => {
    const value = input[key];
    return [key, { ...value, rate: value.opportunities ? value.count / value.opportunities : null,
      evidence: value.opportunities === 0 ? "unknown" : value.opportunities < 10 ? "insufficient" : "observed" }];
  })) as Record<Metric, Observation>;
}

/** Validate entire completed hands before aggregating any visible action facts. */
function validateHand(hand: BotHandContext): PokerGameState | null {
  if (!hand.initialState || !hand.finalState || hand.actions.some(item => !item.action || !item.stateBefore)) return null;
  const final = engine.restore(hand.finalState);
  if (engine.snapshot(final).street !== "complete") throw new BotHistoryConflictError();
  try {
    if (projectBotHistory(hand, final, "").status !== "complete") return null;
  } catch (error) {
    if (error instanceof PokerRuleError) throw new BotHistoryConflictError();
    throw error;
  }
  for (const item of hand.actions) {
    const before = item.stateBefore!;
    const view = engine.decisionView(before);
    const actor = view.players.find(player => player.seat === view.currentActorSeat);
    if (!actor || !isDeepStrictEqual(identity(before.config.players.find(player => player.id === actor.id)),
        identity(hand.initialState.config.players.find(player => player.id === actor.id)))) throw new BotHistoryConflictError();
  }
  return hand.initialState;
}

export function projectSessionStats(session: BotSessionContext | null, decision: PokerGameState, heroId: string): BotSessionStats {
  const current = engine.decisionView(decision);
  const currentComplete = session?.currentHand ? projectBotHistory(session.currentHand, decision, heroId).status === "complete" : false;
  const selected = session?.previousHands ?? [];
  if (selected.length > 50 || selected.some((hand, index) => hand.handNumber >= current.handNumber ||
    (index > 0 && hand.handNumber <= selected[index - 1].handNumber))) throw new BotHistoryConflictError();
  const validated = selected.map(hand => ({ hand, initial: validateHand(hand) }));
  const participants = current.players.map(player => ({ seat: player.seat, id: player.id,
    key: identity(decision.config.players.find(config => config.id === player.id)), continuous: true,
    headsUp: counts(), multiway: counts() }));
  let expectedHand = current.handNumber - 1;
  let gaps = false;
  for (const { hand, initial } of [...validated].reverse()) {
    const gap = hand.handNumber !== expectedHand;
    gaps ||= gap;
    expectedHand = hand.handNumber - 1;
    for (const participant of participants) {
      const old = initial?.config.players.find(player => player.id === participant.id);
      if (gap || !initial || !participant.key || !isDeepStrictEqual(participant.key, identity(old))) participant.continuous = false;
      if (!participant.continuous || !initial) continue;
      if (hand.actions.some(item => !isDeepStrictEqual(participant.key,
          identity(item.stateBefore?.config.players.find(player => player.id === participant.id)))) ||
          !isDeepStrictEqual(participant.key, identity(hand.finalState?.config.players.find(player => player.id === participant.id)))) {
        participant.continuous = false;
        continue;
      }
      const dealt = engine.decisionView(initial);
      if (!dealt.players.some(player => player.id === participant.id)) { participant.continuous = false; continue; }
      const own = hand.actions.filter(item => {
        const view = engine.decisionView(item.stateBefore!);
        return view.players.find(player => player.seat === view.currentActorSeat)?.id === participant.id;
      });
      // Forced folds have no reliable strategic opportunity. Conservatively omit this participant-hand.
      if (own.some(item => item.forcedDeparture || item.stateBefore!.config.players.find(player => player.id === participant.id)?.leaving)) continue;
      const bucket = dealt.players.length === 2 ? participant.headsUp : participant.multiway;
      const observe = (metric: Metric, success: boolean) => { bucket[metric].opportunities++; bucket[metric].count += Number(success); };
      const preflop = own.filter(item => engine.snapshot(item.stateBefore!).street === "preflop");
      if (preflop.length) {
        observe("vpip", preflop.some(item => ["call", "bet", "raise"].includes(item.action!.type)));
        observe("preflopRaise", preflop.some(item => ["bet", "raise"].includes(item.action!.type)));
      }
      for (const [index, item] of hand.actions.entries()) {
        const view = engine.decisionView(item.stateBefore!);
        const actor = view.players.find(player => player.seat === view.currentActorSeat)!;
        if (actor.id !== participant.id) continue;
        const action = item.action!.type;
        if (view.street === "preflop" && dealt.players.length === 2) {
          if (index === 0 && actor.seat === dealt.buttonSeat) {
            observe("buttonOpenRaise", action === "raise"); observe("buttonLimp", action === "call"); observe("buttonFold", action === "fold");
          }
          if (index === 1 && actor.seat === dealt.bigBlindSeat && hand.actions[0].action?.type === "raise") {
            const prefix = hand.actions[0].action.amount / dealt.bigBlind <= 3 ? "bbSmallOpen" : "bbLargeOpen";
            observe(`${prefix}Fold`, action === "fold"); observe(`${prefix}Call`, action === "call"); observe(`${prefix}Raise`, action === "raise");
          }
        }
        if (view.street === "flop" || view.street === "turn" || view.street === "river") {
          const legal = engine.getLegalActions(item.stateBefore!);
          if (legal.some(candidate => candidate.type === "bet" || candidate.type === "raise")) observe(`${view.street}Aggression`, action === "bet" || action === "raise");
          if (view.currentBet > actor.committedStreet && legal.some(candidate => candidate.type === "call")) observe(`${view.street}FoldFacingBet`, action === "fold");
        }
      }
    }
  }
  // Within the 50-hand window, unselected/missing earlier hands are explicitly incomplete.
  gaps ||= expectedHand > 0 && selected.length < 50;
  return { version: sessionStatsVersion,
    coverage: { status: session && currentComplete && !gaps && validated.every(row => row.initial) ? "complete" : "incomplete",
      selectedHands: selected.length, validatedHands: validated.filter(row => row.initial).length,
      excludedHands: validated.filter(row => !row.initial).length, window: 50 },
    participants: participants.map(participant => ({ seat: participant.seat, role: participant.id === heroId ? "hero" : "opponent",
      headsUp: observations(participant.headsUp), multiway: observations(participant.multiway) })) };
}
