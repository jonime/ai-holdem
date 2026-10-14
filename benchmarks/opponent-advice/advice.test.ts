import { describe, expect, it, vi } from "vitest";
import { projectSessionStats, type Observation } from "@/lib/poker/session-stats";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { opponentAdvice, tendency, wilson95 } from "./advice";
import { adviceFixtures, recordedHistory } from "./fixtures";
import { summarizePilot, preflight, pilotBots } from "./pilot";
import { cappedBot } from "../poker-context-harness";
import type { BotContext } from "@/lib/bots/types";
const observation = (count: number, opportunities: number): Observation => ({ count, opportunities, rate: opportunities ? count / opportunities : null, evidence: opportunities < 10 ? "insufficient" : "observed" });
const fixtures = adviceFixtures(5);
describe("Wilson eligibility and thresholds", () => {
  it("uses 95% Wilson bounds with strict thresholds, independent of reported rate/evidence", () => {
    expect(wilson95(0, 0)).toBeNull(); expect(wilson95(5, 10)![0]).toBeCloseTo(.236593, 5);
    expect(tendency(observation(9, 9))).toBeNull(); expect(tendency(observation(0, 9))).toBeNull();
    expect(tendency(observation(10, 10))?.kind).toBe("frequent_folding");
    expect(tendency(observation(9, 10))).toBeNull();
    expect(tendency(observation(0, 10))?.kind).toBe("frequent_continuation");
    expect(tendency(observation(1, 10))).toBeNull();
    expect(tendency(observation(1, 50))?.kind).toBe("frequent_continuation");
    expect(tendency(observation(39, 50))?.kind).toBe("frequent_folding");
    for (const [count, n] of [[-1, 10], [11, 10], [1.1, 10], [0, NaN]]) expect(() => wilson95(count, n)).toThrow();
  });
});
describe("replayed situational advice", () => {
  it("provides twelve fixed situations with the requested street mix", () => {
    expect(fixtures).toHaveLength(12);
    for (const prefix of ["HU", "MW"]) expect(fixtures.filter(f => f.id.startsWith(prefix)).map(f => f.contexts.folding.hand.street)).toEqual(["preflop", "preflop", "flop", "flop", "turn", "river"]);
    expect(fixtures.find(f => f.id === "HU-flop-draw")!.contexts.folding.hero.holeCards).toEqual(["Js", "Ts"]);
    expect(fixtures.find(f => f.id === "HU-flop-draw")!.contexts.folding.hand.communityCards).toEqual(["9s", "8s", "2c"]);
  });
  it("fixes every contrast except the relevant opponent's observations and suppresses sparse/omitted evidence", () => {
    for (const fixture of fixtures) {
      const strip = (context: BotContext) => { const { sessionStats, ...rest } = context; return { rest, participants: sessionStats?.participants.filter(p => p.seat !== fixture.target) }; };
      expect(strip(fixture.contexts.insufficient)).toEqual(strip(fixture.contexts.folding));
      expect(strip(fixture.contexts.continuation)).toEqual(strip(fixture.contexts.folding));
      expect(opponentAdvice(fixture.contexts.omitted)).toEqual([]);
      expect(opponentAdvice(fixture.contexts.insufficient)).toEqual([]);
      const folds = opponentAdvice(fixture.contexts.folding), continues = opponentAdvice(fixture.contexts.continuation);
      if (fixture.id.startsWith("MW-preflop")) { expect(folds).toEqual([]); expect(continues).toEqual([]); }
      else {
        expect(folds.length).toBeGreaterThan(0); expect(continues.length).toBeGreaterThan(0);
        expect(folds.every(a => a.seat === fixture.target && a.tendency === "frequent_folding")).toBe(true);
        expect(continues.every(a => a.tendency === "frequent_continuation")).toBe(true);
      }
    }
  });
  it("matches opening-size evidence per candidate and ignores aggression, wrong street and all-in opponents", () => {
    const small = fixtures.find(f => f.id === "HU-preflop-small")!.contexts.folding;
    expect(opponentAdvice(small).every(a => a.metric === "bbSmallOpenFold" && small.sizingOptions.find(s => s.choice === a.sizing)!.amount! <= 6)).toBe(true);
    const large = fixtures.find(f => f.id === "HU-preflop-large")!.contexts.folding;
    expect(opponentAdvice(large).every(a => a.metric === "bbLargeOpenFold" && large.sizingOptions.find(s => s.choice === a.sizing)!.amount! > 6)).toBe(true);
    const flop = fixtures.find(f => f.id === "HU-flop-draw")!.contexts.folding;
    expect(opponentAdvice({ ...flop, hand: { ...flop.hand, street: "turn" } })).toEqual([]);
    expect(opponentAdvice({ ...flop, opponents: flop.opponents.map(p => ({ ...p, status: "all_in" })) })).toEqual([]);
    expect(opponentAdvice({ ...flop, situation: { ...flop.situation!, historyStatus: "unknown" } })).toEqual([]);
  });
  it("resets changed identities, excludes forced departures and is invariant to hidden history cards", () => {
    const f = fixtures.find(f => f.id === "HU-flop-draw")!;
    const hero = engine.snapshot(f.state).currentActorId!;
    const project = (previousHands: typeof f.sources.folding.hands, state = f.state) => projectSessionStats({ gameId: "fixture", version: 0, currentHand: f.currentHand, previousHands }, state, hero);
    const canonical = project(f.sources.folding.hands);
    const hidden = recordedHistory(2, "flop", f.target, "folding", 6, ["7s", "2h", "Ac", "Kd"]);
    expect(project(hidden.hands)).toEqual(canonical);
    const forced = f.sources.folding.hands.map(hand => ({ ...hand, actions: hand.actions.map(action => ({ ...action, forcedDeparture: engine.decisionView(action.stateBefore!).currentActorSeat === f.target })) }));
    expect(opponentAdvice({ ...f.contexts.folding, sessionStats: project(forced) })).toEqual([]);
    const changed = { ...f.state, config: { ...f.state.config, players: f.state.config.players.map(p => p.seat === f.target ? { ...p, playerToken: "different" } : p) } };
    expect(opponentAdvice({ ...f.contexts.folding, sessionStats: project(f.sources.folding.hands, changed) })).toEqual([]);
    expect(opponentAdvice({ ...f.contexts.folding, sessionStats: projectSessionStats(null, f.state, hero) })).toEqual([]);
    expect(() => project([{ ...f.sources.folding.hands[0], actions: [{ ...f.sources.folding.hands[0].actions[0], action: { type: "check" } }] }])).toThrow();
  });
  it("injects only extra advice, preserving Jev questions and one request per decision", async () => {
    const requests: Parameters<Parameters<typeof pilotBots>[0]["evaluate"]>[0][] = [];
    const bots = pilotBots({ async evaluate(request) {
      requests.push(request); const choices = Object.keys(request.questions.move.criteria), choice = choices.includes("check") ? "check" : "call";
      return { answers: { move: { type: "choice", choice, confidence: 1, probabilities: Object.fromEntries(choices.map(k => [k, Number(k === choice)])) } } };
    } }, async () => { throw new Error("Unexpected network"); });
    const f = fixtures.find(f => f.id === "HU-flop-draw")!;
    await bots.jev.current.decide(f.contexts.folding); await bots.jev.advice.decide(f.contexts.folding);
    expect(requests).toHaveLength(2); expect(requests[0].questions).toEqual(requests[1].questions);
    const { benchmarkOpponentAdvice, ...rest } = requests[1].state as BotContext & { benchmarkOpponentAdvice: unknown };
    expect(benchmarkOpponentAdvice).toBeDefined(); expect(rest).toEqual(requests[0].state);
    await bots.jev.advice.decide(f.contexts.insufficient);
    expect(requests[2].state).not.toHaveProperty("benchmarkOpponentAdvice");
  });
  it("summaries preserve failed/missing pairs and refuses unapproved paid preflight", () => {
    expect(summarizePilot([]).groups).toEqual([]);
    expect(() => preflight()).toThrow();
  });
});

it("hides current opponent cards from both experimental inputs and advice", () => {
  const hidden = adviceFixtures(5, ["7c", "2d"]);
  for (let n = 0; n < fixtures.length; n++) {
    expect(hidden[n].contexts).toEqual(fixtures[n].contexts);
    expect(opponentAdvice(hidden[n].contexts.folding)).toEqual(opponentAdvice(fixtures[n].contexts.folding));
  }
}, 30_000);
it("preserves LLM schema, settings and passive sizing in a single request", async () => {
  vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true"); vi.stubEnv("LLM_API_KEY", "offline"); vi.stubEnv("LLM_API_ENDPOINT", "https://example.invalid");
  const requests: { model: string; reasoning: unknown; messages: { role: string; content: string }[]; response_format: unknown }[] = [];
  const bots = pilotBots({ async evaluate() { throw new Error("Unexpected Jev call"); } }, async (_url, init) => {
    requests.push(JSON.parse(String(init.body)));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ action: "check", sizing: null }) } }] });
  });
  try {
    const context = fixtures.find(f => f.id === "HU-flop-draw")!.contexts.folding;
    await bots.mini.current.decide(context); await bots.mini.advice.decide(context);
    expect(requests).toHaveLength(2);
    expect(requests[0].response_format).toEqual(requests[1].response_format);
    expect(requests[0].messages[0]).toEqual(requests[1].messages[0]);
    expect(requests[1].model).toBe("openai/gpt-5.4-mini"); expect(requests[1].reasoning).toEqual({ effort: "low" });
    const body = JSON.parse(requests[1].messages[1].content), current = JSON.parse(requests[0].messages[1].content);
    expect(body.benchmarkOpponentAdvice.items.length).toBeGreaterThan(0);
    delete body.benchmarkOpponentAdvice; expect(body).toEqual(current);
  } finally { vi.unstubAllEnvs(); }
});
it("charges failures to the shared budget and never retries or exceeds it", async () => {
  const budget = { remaining: 2 }; let requests = 0;
  const failing = cappedBot({ async decide() { requests++; throw new Error("provider failure"); } }, budget);
  const context = fixtures[0].contexts.omitted;
  await expect(failing.decide(context)).rejects.toThrow("provider failure");
  await expect(failing.decide(context)).rejects.toThrow("provider failure");
  await expect(failing.decide(context)).rejects.toThrow("Decision-call cap exhausted");
  expect(requests).toBe(2); expect(budget.remaining).toBe(0);
});
