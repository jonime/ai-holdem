import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildScenario, gradeAction, scenarios } from "@/benchmarks/scenarios/harness";
import { LlmPokerBot } from "./llm";
import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { createPokerAIState } from "@/lib/poker/ai-state";
import { createSizingOptions } from "@/lib/typesafe/questions";

function response(action: string, sizing: string | null = null) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ action, sizing }) } }],
  }));
}

describe("LLM scenario safeguards", () => {
  beforeEach(() => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
    vi.stubEnv("LLM_API_ENDPOINT", "https://llm.example.test/chat/completions");
    vi.stubEnv("LLM_API_KEY", "test-key");
  });
  afterEach(() => vi.unstubAllEnvs());

  for (const profile of ["balanced", "tight", "aggressive"] as const) {
    for (const scenario of scenarios) {
      it(`${profile}: ${scenario.id} constrains schema and context consistently`, async () => {
        const fixture = buildScenario(scenario);
        const original = structuredClone(fixture.context);
        const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
          const request = JSON.parse(String(init.body));
          const visible = JSON.parse(request.messages[1].content);
          const choices: string[] = request.response_format.json_schema.schema.properties.action.enum;
          expect(choices.length).toBeGreaterThan(0);
          expect(choices).toEqual(visible.legalActions.map((action: { type: string }) => action.type));
          for (const forbidden of scenario.forbidden) expect(choices).not.toContain(forbidden);
          expect(visible.opponents[0]).not.toHaveProperty("holeCards");
          expect(visible).not.toHaveProperty("engineState");
          // The mock chooses from the advertised schema, like a constrained provider.
          const action = choices.find((choice) => choice === "check" || choice === "call") ?? choices[0];
          return response(action);
        });
        const result = await new LlmPokerBot("test-model", profile, fetcher).decide(fixture.context);
        expect(gradeAction(scenario, fixture, result.action).status).toBe("pass");
        expect(fixture.context).toEqual(original);
      });
    }
  }

  it.each([
    ["royal-flush-facing-all-in", "fold"],
    ["royal-board-facing-small-bet", "raise"],
    ["board-quads-low-kicker-facing-all-in", "call"],
    ["free-check", "fold"],
  ])("rejects an excluded provider action: %s / %s", async (id, action) => {
    const scenario = scenarios.find((scenario) => scenario.id === id)!;
    const { context } = buildScenario(scenario);
    await expect(new LlmPokerBot("test-model", async () => response(action, "all_in"))
      .decide(context)).rejects.toThrow("illegal action");
  });

  it("corrects pot odds and raise sizing from live street commitments", async () => {
    const scenario = scenarios.find((scenario) => scenario.id === "royal-flush-facing-bet")!;
    const fixture = buildScenario(scenario);
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      const visible = JSON.parse(request.messages[1].content);
      expect(visible.hand.pot).toBe(6);
      expect(visible.analysis).toMatchObject({ callCost: 2, contestablePotAfterCall: 8, potOddsToCall: 0.25 });
      expect(visible.sizingOptions).toContainEqual(expect.objectContaining({ choice: "one_half_pot", amount: 6 }));
      return response("raise", "one_half_pot");
    });
    const result = await new LlmPokerBot("test-model", fetcher).decide(fixture.context);
    expect(result.action).toEqual({ type: "raise", amount: 6 });
    expect(gradeAction(scenario, fixture, result.action).status).toBe("pass");
  });

  it("keeps uncertain river calls and folds available even when sampled equity is 1", async () => {
    const { context } = buildScenario({
      ...scenarios[2],
      deck: ["Kc", "As", "Kd", "2d", "3c", "9s", "8s", "7s", "4c", "6s", "5c", "Kh"],
    });
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      expect(request.response_format.json_schema.schema.properties.action.enum).toEqual(["fold", "call"]);
      return response("fold");
    });
    await new LlmPokerBot("test-model", fetcher).decide({ ...context, analysis: { ...context.analysis, showdownEquity: 1 } });
  });

  it("uses the stack-capped call and excludes unmatched opponent chips", async () => {
    let game = engine.startHand(engine.createGame({
      smallBlind: 1, bigBlind: 2,
      players: [
        { id: "short", name: "Short", seat: 0, stack: 50, controller: "bot" },
        { id: "deep", name: "Deep", seat: 1, stack: 200, controller: "bot" },
      ],
    }), createDeterministicDeck());
    game = engine.applyAction(game, "short", { type: "call", amount: 1 });
    game = engine.applyAction(game, "deep", { type: "raise", amount: 100 });
    const state = createPokerAIState(game, "short", { equitySamples: 10 });
    expect(state.hero.amountToCall).toBe(98);
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      const visible = JSON.parse(request.messages[1].content);
      expect(visible.hero.amountToCall).toBe(48);
      expect(visible.hand.pot).toBe(52);
      expect(visible.analysis).toMatchObject({ callCost: 48, contestablePotAfterCall: 100, potOddsToCall: 0.48 });
      return response("call");
    });
    const result = await new LlmPokerBot("test-model", fetcher).decide({ ...state, sizingOptions: createSizingOptions(state) });
    expect(result.action).toEqual({ type: "call", amount: 48 });
    expect(() => engine.applyAction(game, "short", result.action)).not.toThrow();
  });
});
