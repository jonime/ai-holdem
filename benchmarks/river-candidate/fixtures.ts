import { createHash } from "node:crypto";
import { createDeterministicDeck, pokerEngineAdapter as engine, riverShareBounds } from "@/lib/poker/adapter";
import { createPokerAIState } from "@/lib/poker/ai-state";
import { projectBotHistory, legacyDecisionHistory, type BotHandContext } from "@/lib/poker/bot-history";
import { createLegacySizingOptions } from "@/lib/typesafe/questions";
import type { AIDifficulty, PokerAction, PokerGameState } from "@/lib/poker/types";
import { deck } from "../range-equity/calculator";
import { randomSource } from "../equity-rules/experiment";
import { allocation, configuration, type Spec } from "./config";
export const seed = (text: string) => createHash("sha256").update(text).digest().readUInt32LE();
export const rng = (text: string) => randomSource(seed(text));
export interface Fixture { spec: Spec; hero: string[]; board: string[]; preRaise: number; postBet: number; stacks: [number, number]; exclusions: Record<string, number> }
export interface Run { state: PokerGameState; initialState: PokerGameState; actions: BotHandContext["actions"][number][]; heroId: string }
function permutations(s: string): string[] { return s.length === 1 ? [s] : [...s].flatMap(c => permutations(s.replace(c, "")).map(p => c + p)); }
export function canonical(hero: readonly string[], board: readonly string[]) {
  return permutations("cdhs").map(p => {
    const rename = (c: string) => c[0] + p["cdhs".indexOf(c[1])];
    return hero.map(rename).sort().join() + "/" + board.map(rename).sort().join();
  }).sort()[0];
}
const discovery = canonical(["9h", "8h"], ["Jh", "Tc", "7c", "2h", "6d"]);
export function makeFixtures(): Fixture[] {
  const seen = new Set([discovery]);
  return [...allocation("development"), ...allocation("confirmation")].map(spec => {
    const random = rng(`${configuration.namespaces[spec.phase]}/${spec.id}`);
    const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    const exclusions: Record<string, number> = {};
    const reject = (why: string) => { exclusions[why] = (exclusions[why] ?? 0) + 1; };
    for (let attempt = 0; attempt < 10000; attempt++) {
      const high = integer(7, 14), ranks = "23456789TJQKA";
      const extra = [...ranks].filter((_, i) => i + 2 < high - 4 || i + 2 > high);
      const a = extra.splice(integer(0, extra.length - 1), 1)[0], b = extra[integer(0, extra.length - 1)];
      let heroRanks = ranks[high - 2] + ranks[high - 3];
      let boardRanks = ranks[high - 4] + ranks[high - 5] + ranks[high - 6] + a + b;
      // Preallocated inactive controls; never selected or replaced based on bot results.
      if (spec.replicate === 0) { boardRanks = "AKQJT"; heroRanks = ranks[integer(0, 7)] + ranks[integer(0, 7)]; }
      const hero = [...heroRanks].map(r => r + "cdhs"[integer(0, 3)]);
      const board = [...boardRanks].map(r => r + "cdhs"[integer(0, 3)]);
      if (new Set([...hero, ...board]).size !== 7) { reject("duplicate-card"); continue; }
      if ([..."cdhs"].some(s => board.filter(c => c[1] === s).length > 2)) { reject("flush-capable-board"); continue; }
      const bounds = riverShareBounds(hero, board);
      if (bounds.minimum < .5) { reject("beatable"); continue; }
      const key = canonical(hero, board);
      if (seen.has(key)) { reject(key === discovery ? "discovery-equivalent" : "duplicate-suit-class"); continue; }
      seen.add(key);
      // Street order itself varies independently of cards and treatment outcomes.
      for (let i = board.length - 1; i > 0; i--) { const j = integer(0, i); [board[i], board[j]] = [board[j], board[i]]; }
      const preRaise = integer(4, 14), postBet = integer(3, 21), committed = preRaise + postBet;
      const remaining = 2 * committed * spec.band;
      const stacks: [number, number] = [committed + remaining, committed + remaining];
      stacks[integer(0, 1)] += integer(0, 12);
      return { spec, hero, board, preRaise, postBet, stacks, exclusions };
    }
    throw new Error(`Generator exhausted: ${spec.id}`);
  });
}
export function materialize(f: Fixture, holding: readonly string[]): Run {
  const used = [...f.hero, ...f.board, ...holding];
  if (holding.length !== 2 || new Set(used).size !== 9 || used.some(c => !deck.includes(c))) throw new Error("Blocked holding");
  const burns = deck.filter(c => !used.includes(c)).slice(0, 3);
  const heroId = `p${f.spec.orientation}`;
  const waiting = engine.createGame({ smallBlind: 1, bigBlind: 2, seatCount: 2, players: [0, 1].map(seat => ({ id: `p${seat}`, name: `Seat ${seat}`, seat, controller: "bot", stack: f.stacks[seat === f.spec.orientation ? 0 : 1] + (f.spec.orientation === 1 ? (seat === 0 ? 1 : -1) : 0) })) });
  // A disposable folded hand rotates the button through engine transitions.
  // Its +/- one-chip blind transfer restores the planned stacks before our deal.
  const base = f.spec.orientation === 1 ? engine.applyAction(engine.startHand(waiting, createDeterministicDeck()), "p0", { type: "fold" }) : waiting;
  let state = engine.startHand(base, createDeterministicDeck([holding[0], f.hero[0], holding[1], f.hero[1], burns[0], ...f.board.slice(0, 3), burns[1], f.board[3], burns[2], f.board[4]]));
  const initialState = state, actions: Run["actions"] = [];
  if (engine.heroCards(state, heroId).join() !== f.hero.join()) throw new Error("Deal orientation mismatch");
  function step(action: PokerAction) {
    const actor = engine.snapshot(state).currentActorId;
    if (!actor) throw new Error("Missing actor");
    actions.push({ sequence: actions.length + 1, action, stateBefore: state });
    state = engine.applyAction(state, actor, action);
  }
  step({ type: "raise", amount: f.preRaise }); step({ type: "call" });
  for (const street of ["flop", "turn"] as const) {
    step({ type: "check" });
    if ((street === "flop") === (f.spec.line === "flop-bet")) { step({ type: "bet", amount: f.postBet }); step({ type: "call" }); }
    else step({ type: "check" });
  }
  step({ type: "check" });
  const view = engine.decisionView(state);
  if (view.currentActorSeat !== f.spec.orientation || view.street !== "river" || view.players[0].committedHand !== view.players[1].committedHand) throw new Error("Invalid root");
  return { state, initialState, actions, heroId };
}
export function context(run: Run, difficulty: AIDifficulty, actor = engine.snapshot(run.state).currentActorId!) {
  const projected = projectBotHistory({ version: 1, handNumber: engine.snapshot(run.state).handNumber, initialState: run.initialState, actions: run.actions }, run.state, actor);
  if (projected.status !== "complete") throw new Error("Incomplete replay");
  const ai = createPokerAIState(run.state, actor, { difficulty, correctedContext: false, historyStatus: "complete", decisionHistory: legacyDecisionHistory(projected.actions) });
  return { ...ai, sizingOptions: createLegacySizingOptions(ai) };
}
