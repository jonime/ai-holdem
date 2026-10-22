import "server-only";
import { z } from "zod";
import { pokerEngineAdapter as engine } from "./adapter";
import { restorePersistedState } from "./persisted-state";
import type { PokerGameState } from "./types";
import { resultsResponseSchema, type PersonalResults } from "@/lib/http/results-contracts";

const ownerPlayer = z.object({ id: z.string().min(1), seat: z.number().int().min(0).max(5),
  controller: z.enum(["human", "bot", "typesafe_ai"]), playerToken: z.string().min(1).nullable().optional() }).passthrough();
const player = ownerPlayer.extend({ name: z.string(), stack: z.number().int().nonnegative().safe() });
const ownership = z.object({ stateSchemaVersion: z.literal(1), config: z.object({ players: z.array(ownerPlayer).min(2).max(6) }).passthrough(), engineState: z.unknown() }).passthrough();
const state = ownership.extend({ config: z.object({ players: z.array(player).min(2).max(6),
  smallBlind: z.number().int().positive().safe(), bigBlind: z.number().int().positive().safe(),
  humanTurnSeconds: z.union([z.literal(30), z.literal(60), z.literal(90), z.null()]).optional(),
}).passthrough() });
const pageSchema = z.strictObject({ throughHand: z.number().int().nonnegative().max(2_147_483_647),
  hands: z.array(z.strictObject({ handNumber: z.number().int().positive(), initialState: z.unknown(), finalState: z.unknown() })).max(100) });
const baselineSchema = z.strictObject({ handNumber: z.number().int().positive(),
  stacks: z.record(z.string(), z.number().int().nonnegative().safe()) });

/** State details are read only through the adapter's validated semantic views. */
function settledResults(initial: PokerGameState, final: PokerGameState, handNumber: number) {
  const before = engine.decisionView(initial);
  const after = engine.decisionView(final);
  const baseline = baselineSchema.parse(initial.handStartStacks);
  if (before.street !== "preflop" || after.street !== "complete" ||
      before.handNumber !== handNumber || after.handNumber !== handNumber ||
      engine.snapshot(initial).handNumber !== handNumber || engine.snapshot(final).handNumber !== handNumber ||
      baseline.handNumber !== handNumber || initial.config.bigBlind !== before.bigBlind ||
      initial.config.smallBlind !== before.smallBlind || before.bigBlind !== after.bigBlind ||
      before.smallBlind !== after.smallBlind || before.players.length !== after.players.length) throw new Error("Inconsistent result history");
  const settled = before.players.map(player => {
    const end = after.players.find(p => p.id === player.id && p.seat === player.seat);
    const startStack = baseline.stacks[player.id];
    if (!end || !Number.isSafeInteger(startStack) || startStack !== player.stack + player.committedHand ||
        !Number.isSafeInteger(end.stack)) throw new Error("Unavailable result stacks");
    return { id: player.id, seat: player.seat, netChips: end.stack - startStack };
  });
  if (settled.reduce((sum, p) => sum + p.netChips, 0) !== 0) throw new Error("Unsettled result stacks");
  return settled;
}
export class ResultsMissing extends Error {}
export type ResultsReader = (afterHand: number, throughHand: number | null) => Promise<unknown>;

/** Streaming aggregation: only one private page exists in memory; failed reads never yield a partial summary. */
export async function getPersonalResults(read: ResultsReader, token: string | null): Promise<PersonalResults> {
  let after = 0;
  let boundary: number | null = null;
  let seen = 0;
  let handsPlayed = 0;
  let availableHands = 0;
  let excludedHands = 0;
  let ownershipIncomplete = false;
  let netChips = 0;
  let netBB = 0;
  let compensation = 0;
  let biggestWin: PersonalResults["biggestWin"] = null;
  let biggestLoss: PersonalResults["biggestLoss"] = null;
  while (true) {
    const raw = await read(after, boundary);
    if (raw === null) throw new ResultsMissing();
    const page = pageSchema.parse(raw);
    if (boundary !== null && page.throughHand !== boundary) throw new Error("Results boundary changed");
    boundary = page.throughHand;
    for (const row of page.hands) {
      if (row.handNumber <= after || row.handNumber > boundary) throw new Error("Invalid results page order");
      after = row.handNumber;
      seen++;
      // Establish ownership independently of result metadata (which may be absent in legacy records).
      let owner: z.infer<typeof ownerPlayer> | undefined;
      try {
        const initial = ownership.parse(row.initialState);
        const restored = restorePersistedState(initial);
        const view = engine.decisionView(restored);
        if (view.handNumber !== row.handNumber || view.street !== "preflop" ||
            engine.snapshot(restored).handNumber !== row.handNumber ||
            new Set(initial.config.players.map(p => p.id)).size !== initial.config.players.length ||
            new Set(initial.config.players.map(p => p.seat)).size !== initial.config.players.length) throw new Error();
        const dealt = view.players.map(p => {
          const config = initial.config.players.find(c => c.id === p.id && c.seat === p.seat);
          if (!config || config.controller === "human" && !config.playerToken) throw new Error();
          return config;
        });
        const owners = dealt.filter(p => token !== null && p.controller === "human" && p.playerToken === token);
        if (owners.length > 1) throw new Error();
        owner = owners[0];
      } catch {
        excludedHands++;
        ownershipIncomplete = true;
        continue;
      }
      if (!owner) continue;
      handsPlayed++;
      try {
        const start = state.parse(row.initialState);
        const final = state.parse(row.finalState);
        const settled = settledResults(restorePersistedState(start), restorePersistedState(final), row.handNumber).find(p => p.id === owner.id && p.seat === owner.seat);
        const owned = engine.publicProjection({ ...restorePersistedState(final), config: start.config,
          handStartStacks: restorePersistedState(start).handStartStacks }, owner.id).viewerHandResult;
        // The existing owner projection resolves the settled stack by engine identity,
        // independently of seat-indexed decision views and mutable final assignments.
        if (!settled || !owned || owned.netChange !== settled.netChips) throw new Error();
        const chips = owned.netChange;
        const bb = chips / start.config.bigBlind;
        const nextChips = netChips + chips;
        if (!Number.isSafeInteger(nextChips) || !Number.isFinite(bb)) throw new Error("Result overflow");
        netChips = nextChips;
        // Compensated summation preserves fractional historical BB until display rounding.
        const adjusted = bb - compensation;
        const sum = netBB + adjusted;
        compensation = (sum - netBB) - adjusted;
        netBB = sum;
        availableHands++;
        const highlight = { handNumber: row.handNumber, netChips: chips, netBB: bb };
        if (chips > 0 && (!biggestWin || chips > biggestWin.netChips)) biggestWin = highlight;
        if (chips < 0 && (!biggestLoss || chips < biggestLoss.netChips)) biggestLoss = highlight;
      } catch { excludedHands++; }
    }
    if (page.hands.length < 100) break;
  }
  const missing = boundary - seen;
  if (missing < 0) throw new Error("Invalid result coverage");
  excludedHands += missing;
  ownershipIncomplete ||= missing > 0;
  return resultsResponseSchema.parse({ results: { throughHand: boundary, handsPlayed, availableHands, excludedHands,
    ownershipIncomplete, incomplete: excludedHands > 0,
    netChips: availableHands === 0 && excludedHands > 0 ? null : netChips,
    netBB: availableHands === 0 && excludedHands > 0 ? null : netBB, biggestWin, biggestLoss } }).results;
}
