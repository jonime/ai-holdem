import "server-only";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { pokerEngineAdapter as engine } from "./adapter";
import { parseBotHandContext } from "@/lib/supabase/bot-context-parser";
import { replayResponseSchema, type HandReplay, type ReplayFrame, type ReplayUnavailableCode } from "@/lib/http/replay-contracts";

export class ReplayOutcome extends Error {
  constructor(readonly code: ReplayUnavailableCode) { super(code); }
}
const recordSchema = z.object({ gameId: z.uuid(), handNumber: z.number().int().positive(), status: z.enum(["playing", "complete", "error"]),
  initialState: z.unknown(), finalState: z.unknown(), revealedIds: z.array(z.string()),
  actions: z.array(z.object({ sequence: z.number().int().positive(), street: z.string(), actorSeat: z.number().int(),
    action: z.string(), amount: z.number().int().nonnegative().nullable(), stateBefore: z.unknown() })),
});

/** The read dependency returns a single statement snapshot; no current assignments participate. */
export async function getHandReplay(read: () => Promise<unknown>, gameId: string, handNumber: number, token: string | null): Promise<HandReplay> {
  const raw = await read(); // Database failures remain unexpected/retryable.
  if (raw === null) throw new ReplayOutcome("REPLAY_MISSING");
  try {
    const row = recordSchema.parse(raw);
    if (row.gameId !== gameId || row.handNumber !== handNumber) throw new Error();
    if (row.status === "playing") throw new ReplayOutcome("REPLAY_UNFINISHED");
    if (row.status !== "complete") throw new Error();
    const history = parseBotHandContext({ ...row, version: 0 });
    if (!history.initialState || !history.finalState) throw new Error();
    const initial = history.initialState;
    const final = history.finalState;
    const start = engine.decisionView(initial);
    if (start.handNumber !== handNumber || start.street !== "preflop" ||
        engine.snapshot(final).handNumber !== handNumber || engine.snapshot(final).street !== "complete") throw new Error();
    if (!isDeepStrictEqual(engine.replayStart(initial).engineState, initial.engineState)) throw new Error();
    const participants = start.players.map(p => {
      const config = initial.config.players.find(c => c.id === p.id && c.seat === p.seat);
      if (!config) throw new Error();
      return { seat: p.seat, name: config.name };
    });
    const owners = initial.config.players.filter(p => token !== null && p.controller === "human" && p.playerToken === token && start.players.some(s => s.id === p.id));
    if (owners.length > 1) throw new Error();
    const viewer = owners[0]?.id ?? null;
    const ownCards = (id: string) => id === viewer ? [...engine.heroCards(initial, id)] : null;
    const frames: ReplayFrame[] = [{ kind: "start", street: start.street, board: start.communityCards, pot: start.pot,
      nextActorSeat: start.currentActorSeat, action: null, players: start.players.map(p => ({ seat: p.seat, stack: p.stack,
        bet: p.committedStreet, folded: p.folded, allIn: p.allIn, cards: ownCards(p.id) })) }];
    let state = initial;
    for (const [index, item] of history.actions.entries()) {
      const persisted = row.actions[index];
      if (item.sequence !== index + 1 || !item.stateBefore || !item.action ||
          !isDeepStrictEqual(state.engineState, item.stateBefore.engineState)) throw new Error();
      const view = engine.decisionView(item.stateBefore);
      const actor = view.players.find(p => p.seat === view.currentActorSeat);
      if (!actor || actor.seat !== persisted.actorSeat || view.street !== persisted.street ||
          !start.players.some(p => p.id === actor.id && p.seat === actor.seat)) throw new Error();
      // Ownership/name changes in later config never affect historical projection.
      const transition = engine.replayTransition(item.stateBefore, actor.id, item.action);
      const action = { sequence: item.sequence, actorSeat: actor.seat, type: item.action.type,
        amount: item.action.type === "call" ? engine.getLegalActions(item.stateBefore).find(a => a.type === "call")?.amount ?? null : "amount" in item.action ? item.action.amount ?? null : null };
      for (const frame of transition.frames) frames.push({ ...frame, action: frame.kind === "action" ? action : null,
        players: frame.players.map(p => ({ seat: p.seat, stack: p.stack, bet: p.bet, folded: p.folded, allIn: p.allIn, cards: ownCards(p.id) })) });
      state = transition.after;
    }
    if (!isDeepStrictEqual(state.engineState, final.engineState)) throw new Error();
    const publicFinal = engine.publicProjection({ ...final, config: initial.config }, viewer, row.revealedIds);
    const end = engine.decisionView(final);
    frames.push({ kind: "result", street: "complete", board: publicFinal.communityCards, pot: publicFinal.pot,
      nextActorSeat: null, action: null, players: start.players.map(p => {
        const numeric = end.players.find(e => e.id === p.id && e.seat === p.seat);
        const visible = publicFinal.players.find(e => e.id === p.id && e.seat === p.seat);
        if (!numeric || !visible) throw new Error();
        return { seat: p.seat, stack: numeric.stack, bet: numeric.committedStreet,
          folded: numeric.folded, allIn: numeric.allIn, cards: visible.holeCards };
      }) });
    return replayResponseSchema.parse({ replay: { gameId, handNumber, dealerSeat: start.buttonSeat,
      smallBlindSeat: start.smallBlindSeat, bigBlindSeat: start.bigBlindSeat, participants, frames, pots: engine.replayPots(final) } }).replay;
  } catch (error) {
    if (error instanceof ReplayOutcome) throw error;
    throw new ReplayOutcome("REPLAY_UNAVAILABLE");
  }
}
