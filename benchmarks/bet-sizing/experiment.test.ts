import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSizingOptions, createLegacySizingOptions, createMoveOptions, inspectMenuAddition } from "@/lib/systemone/questions";
import { evaluationContext } from "../poker-context-harness";
import { createDeterministicDeck } from "@/lib/poker/adapter";
import { prepareProviderContext } from "@/lib/poker/provider-context";
import { TypesafeResponseError } from "@/lib/typesafe/types";
import { EevoResponseError } from "@/lib/bots/eevo";
import { BotProviderError } from "@/lib/bots/types";
import { LlmPokerBot } from "@/lib/bots/llm";
import { ConfidenceAwareJevPokerBot } from "@/lib/bots/jev-confidence";
import { ConfidenceAwareEevoPokerBot } from "@/lib/bots/eevo-confidence";
import { EquityRulesV2Bot } from "@/lib/bots/equity-rules-v2";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { publicAIDecisionSchema } from "@/lib/http/schemas";
import { digest, verifyFreeze } from "../bot-audit/safety";
import golden from "./default-requests.json";
import { fixtures, menus } from "./fixtures";
import { prepare, observe, type Row } from "./experiment";
import { analyze } from "./analysis";
import { Ledger, preflight } from "./safety";
import { scriptedSystemOne, scriptedAnswer, liveBot } from "./providers";
import { offline } from "./offline";

let p: ReturnType<typeof prepare>;
beforeAll(() => { p = prepare(5); }, 30000);
afterEach(() => { vi.unstubAllEnvs(); });
function llmEnv() { vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true"); vi.stubEnv("LLM_API_KEY", "scripted-key"); vi.stubEnv("LLM_API_ENDPOINT", "https://openrouter.ai/api/v1/chat/completions"); }
function row(index = 0): Row {
  const { inputHash: _hash, ...e } = p.plan[index]; void _hash;
  const f = p.matrix.find(f => f.id === e.fixture)!;
  const addition = f.availability.find(a => a.menu === e.menu)!;
  const addedSelected = addition.reason === "available";
  const payment = addedSelected ? addition.amount - f.context.hero.investedThisStreet : 0;
  return { ...e, control: !!f.control, addedAvailable: addedSelected, omission: addition.reason, addedSelected,
    action: addedSelected ? { type: "bet", amount: addition.amount } : { type: "check" }, sizing: addedSelected ? addition.choice : null,
    payment, potFraction: payment / f.context.hand.pot, stackFraction: payment / f.context.analysis.effectiveStack,
    latencyMs: 1, cost: null, model: "jev-latest", revision: null, policy: "test", failure: null, failureStage: null };
}
describe("independent betting menus", () => {
  it("balances the fixed matrix, observations, allocation and menu/provider order", () => {
    expect(p.matrix).toHaveLength(16); expect(p.plan).toHaveLength(960);
    const eligible = p.matrix.filter(f => !f.control);
    for (const condition of ["omitted", "insufficient", "folding", "continuation"]) expect(eligible.filter(f => f.condition === condition)).toHaveLength(3);
    for (const f of p.matrix) for (const provider of ["jev", "llm"]) for (const menu of menus) expect(p.plan.filter(e => e.fixture === f.id && e.provider === provider && e.menu === menu)).toHaveLength(10);
    expect(new Set(p.plan.map(e => e.id)).size).toBe(960);
    expect(new Set(Array.from({ length: 10 }, (_, i) => p.plan[i * 96].menu)).size).toBe(3);
    for (const f of eligible) {
      expect(f.availability.slice(1).map(a => a.reason)).toEqual(["available", "available"]);
      expect(f.context.analysis.equitySamples).toBe(5);
      for (const menu of menus) {
        const { sizingOptions: _sizes, ...rest } = f.variants[menu]; void _sizes;
        const { sizingOptions: _base, ...base } = f.variants.current; void _base;
        expect(rest).toEqual(base);
      }
      if (f.condition === "folding" || f.condition === "continuation") expect(f.context).toHaveProperty("opponentAdvice.items", expect.arrayContaining([expect.objectContaining({ seat: 0, text: expect.stringContaining("Do not justify an all-in or an oversized deep-stack bet") })]));
      else expect(f.context).not.toHaveProperty("opponentAdvice");
    }
  });
  it("preserves candidates, ordering, explicit all-in and controls", () => {
    for (const f of p.matrix) for (const menu of menus) {
      const baseline = f.variants.current.sizingOptions, actual = f.variants[menu].sizingOptions;
      baseline.forEach(b => expect(actual).toContainEqual(b));
      expect(actual.map(a => a.amount)).toEqual(actual.map(a => a.amount).sort((a, b) => (a ?? 0) - (b ?? 0)));
      if (f.control) expect(actual).toEqual(baseline);
      else expect(actual).toHaveLength(baseline.length + Number(menu !== "current"));
      for (const move of createMoveOptions(f.variants[menu], menu)) expect(() => engine.applyAction(f.state, engine.snapshot(f.state).currentActorId!, move.action)).not.toThrow();
    }
    const safe = p.matrix.find(f => f.id === "safeguard")!;
    for (const menu of menus) expect(createMoveOptions(safe.variants[menu], menu).map(m => m.choice)).toEqual(["check"]);
  });
  it("rounds additional payments from live pot, respects commitments, and never clamps additions", () => {
    const c = p.matrix[0].context;
    const state = { ...c, hand: { ...c.hand, pot: 999 }, analysis: { ...c.analysis, livePot: 11 }, hero: { ...c.hero, investedThisStreet: 7 }, legalActions: [{ type: "check" }, { type: "bet", minAmount: 9, maxAmount: 100 }] as const };
    expect(inspectMenuAddition(state, "quarter-pot")).toMatchObject({ amount: 10, reason: "available" });
    expect(inspectMenuAddition(state, "1.5-pot")).toMatchObject({ amount: 24, reason: "available" });
    const prepared = prepareProviderContext(state, "quarter-pot");
    expect(prepared.sizingOptions.find(s => s.choice === "quarter_pot")).toMatchObject({ amount: 10, description: expect.stringContaining("pay 3 additional chips and put 14 chips") });
    const duplicate = { ...state, analysis: { ...state.analysis, livePot: 7 }, hand: { ...state.hand, pot: 7 } };
    expect(inspectMenuAddition(duplicate, "quarter-pot").reason).toBe("duplicate");
    expect(inspectMenuAddition({ ...state, legalActions: [{ type: "bet", minAmount: 11, maxAmount: 100 }] }, "quarter-pot").reason).toBe("below_minimum");
    expect(inspectMenuAddition({ ...state, legalActions: [{ type: "bet", minAmount: 9, maxAmount: 24 }] }, "1.5-pot").reason).toBe("maximum_or_above");
    // Side-pot contestability never replaces the live pot as the sizing basis.
    const side = { ...state, analysis: { ...state.analysis, contestablePotAfterCall: 2 } };
    expect(inspectMenuAddition(side, "1.5-pot").amount).toBe(24);
    expect(createSizingOptions(prepareProviderContext(side), "1.5-pot").at(-1)?.choice).toBe("all_in");
  });
  it("uses live pot for both additions with real all-in side pots", () => {
    const initial = engine.startHand(engine.createGame({ smallBlind: 1, bigBlind: 2, seatCount: 3,
      players: [200, 3, 200].map((stack, seat) => ({ id: `side-${seat}`, name: "Side", seat, stack, controller: "human" })) }), createDeterministicDeck());
    let state = initial;
    const actions = [];
    for (let i = 0; i < 3; i++) {
      const call = engine.getLegalActions(state).find(a => a.type === "call");
      const action = i === 0 ? { type: "raise" as const, amount: 6 } : { type: "call" as const, amount: call?.type === "call" ? call.amount : 0 };
      actions.push({ sequence: i + 1, action, stateBefore: state });
      state = engine.applyAction(state, engine.snapshot(state).currentActorId!, action);
    }
    const c = evaluationContext(state, { version: 0, handNumber: 1, initialState: initial, actions }, "facts", 5);
    expect(c.hand.street).toBe("flop"); expect(c.hand.pot).toBe(15);
    expect(c.opponents.some(o => o.status === "all_in")).toBe(true);
    for (const menu of menus.slice(1)) {
      const addition = inspectMenuAddition(c, menu);
      expect(addition.reason).toBe("available");
      expect(addition.amount).toBe(Math.round(15 * (menu === "quarter-pot" ? .25 : 1.5)));
      expect(() => engine.applyAction(state, engine.snapshot(state).currentActorId!, { type: "bet", amount: addition.amount })).not.toThrow();
    }
  });
  it("matches requests captured from the original implementations before injection", async () => {
    llmEnv();
    for (const f of p.matrix) {
      const expected = golden.rows.find(r => r.fixture === f.id)!;
      for (const provider of ["jev", "eevo"] as const) {
        const client = { async evaluate(request: Parameters<typeof scriptedAnswer>[0]) { expect(digest(request)).toBe(expected[provider]); return scriptedAnswer(request, Object.keys(request.questions.move.criteria)[0]); } };
        await (provider === "jev" ? new ConfidenceAwareJevPokerBot(client) : new ConfidenceAwareEevoPokerBot(client)).decide(f.context);
      }
      await new LlmPokerBot("openai/gpt-5.4-mini", { profileId: "balanced", reasoning: "low" }, async (_url, init) => {
        expect(digest(JSON.parse(String(init.body)))).toBe(expected.llm);
        const passive = f.context.legalActions.find(a => a.type === "check" || a.type === "call" || a.type === "fold")!;
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: passive.type, sizing: null }) } }] }));
      }).decide(f.context);
    }
  });
  it("uses actual Jev/Eevo wrappers and the LLM schema and validators for every menu", async () => {
    const result = await offline(5);
    expect(result.rows).toHaveLength(48); expect(result.requests).toBe(0);
  }, 30000);
  it("preserves provider-specific invalid-output errors and never retries provider failures", async () => {
    for (const menu of menus.slice(1)) for (const provider of ["jev", "eevo"] as const) {
      const bad = { evaluate: vi.fn(async () => ({ answers: {} })) };
      await expect(scriptedSystemOne(provider, menu, bad).decide(p.matrix[0].context)).rejects.toBeInstanceOf(provider === "jev" ? TypesafeResponseError : EevoResponseError);
      expect(bad.evaluate).toHaveBeenCalledTimes(1);
      const error = new BotProviderError("failure", undefined, { category: "network" });
      const failed = { evaluate: vi.fn(async () => { throw error; }) };
      await expect(scriptedSystemOne(provider, menu, failed).decide(p.matrix[0].context)).rejects.toBe(error);
      expect(failed.evaluate).toHaveBeenCalledTimes(1);
    }
  });
  it("rejects experimental sizing in the wrong LLM menu and preserves public contracts", async () => {
    llmEnv();
    for (const menu of menus) {
      const invalid = menu === "quarter-pot" ? "one_and_half_pot" : "quarter_pot";
      await expect(new LlmPokerBot("test", { menu }, async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: "bet", sizing: invalid }) } }] }))).decide(p.matrix[0].context)).rejects.toThrow("unavailable sizing");
    }
    expect(publicAIDecisionSchema.shape.sizing.safeParse({ choice: "quarter_pot", probabilities: null, confidence: null }).success).toBe(false);
  });
  it("keeps hidden cards out of inputs and Equity Rules unchanged", async () => {
    const hidden = fixtures(5, ["Kh", "Kd"]);
    const rules = new EquityRulesV2Bot();
    for (let i = 0; i < p.matrix.length; i++) {
      const f = p.matrix[i];
      if (f.control === "preflop" || f.control === "raise") continue; // These controls change the actor after the chosen deal.
      expect(hidden[i].context).toEqual(f.context);
      for (const menu of menus) expect(createLegacySizingOptions(f.variants[menu])).toEqual(createLegacySizingOptions(f.context));
      const input = { ...f.context, sizingOptions: createLegacySizingOptions(f.context) };
      expect((await rules.decide(input)).action).toEqual((await rules.decide({ ...input, sizingOptions: createLegacySizingOptions(hidden[i].context) })).action);
      expect(JSON.stringify(f.context)).not.toMatch(/playerToken|engineState|initialState|stateBefore/);
    }
  });
});
describe("pilot safety and report-only analysis", () => {
  it("requires fresh independent authorization, exact endpoints, and no Eevo key", () => {
    expect(() => preflight({})).toThrow();
    const env = { BET_SIZING_AUTHORIZATION: "authorize-new-960-bet-sizing-v1", BOT_SCENARIO_LIVE: "true", EXTERNAL_INFERENCE_ENABLED: "true", BOT_DECISION_CALL_CAP: "1000", TYPESAFE_API_KEY: "real-jev", LLM_API_KEY: "real-llm", LLM_API_ENDPOINT: "https://openrouter.ai/api/v1/chat/completions" };
    expect(() => preflight(env)).not.toThrow();
    expect(() => preflight({ ...env, BOT_DECISION_CALL_CAP: "1001" })).toThrow();
  });
  it("debits durably before send, refuses parallelism/retries/replay and stops after failure", () => {
    const dir = mkdtempSync(join(tmpdir(), "bet-sizing-"));
    try {
      const path = join(dir, "ledger.json"), ledger = new Ledger(path, p);
      const slot = ledger.reserve(p.plan[0]);
      expect(() => ledger.reserve(p.plan[1])).toThrow();
      ledger.request(slot); expect(JSON.parse(readFileSync(path, "utf8")).slots[0].requests).toBe(1);
      expect(() => ledger.request(slot)).toThrow();
      ledger.complete(slot, { ...row(), failure: "network", failureStage: "provider" });
      expect(() => ledger.reserve(p.plan[1])).toThrow();
      expect(() => new Ledger(path, p)).toThrow();
      expect(() => new Ledger(join(dir, "cap.json"), p, 1001)).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("exhausts only the prescribed allocation, leaving the ceiling unavailable", () => {
    const dir = mkdtempSync(join(tmpdir(), "bet-sizing-cap-"));
    try {
      const ledger = new Ledger(join(dir, "ledger.json"), p);
      vi.spyOn(ledger, "save").mockImplementation(() => {}); // Persistence is checked separately; exercise all allocation transitions without quadratic disk writes.
      for (let i = 0; i < 960; i++) { const s = ledger.reserve(p.plan[i]); ledger.request(s); ledger.complete(s, row(i)); }
      expect(() => ledger.reserve(p.plan[0])).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 30000);
  it("detects source changes and excludes incomplete matched blocks in partial reports", () => {
    const dir = mkdtempSync(join(tmpdir(), "bet-sizing-freeze-"));
    try { const path = join(dir, "source"); writeFileSync(path, "changed"); expect(() => verifyFreeze({ [path]: "old-hash" })).toThrow("freeze mismatch"); }
    finally { rmSync(dir, { recursive: true, force: true }); }
    const report = analyze([row()]);
    expect(report.pilotComplete).toBe(false); expect(report.shortlist.every(s => !s.eligibleForMatchStudy)).toBe(true);
    expect(report.contrasts.every(c => c.completeBlocks === 0)).toBe(true);
    expect(() => analyze([row(), row()])).toThrow("Duplicate evidence");
  });
  it("applies the frozen per-provider usage screen only to complete mechanically valid pilots", () => {
    const complete = p.plan.map((_, i) => row(i));
    const report = analyze(complete);
    expect(report.pilotComplete).toBe(true);
    expect(report.shortlist.every(s => s.eligibleForMatchStudy)).toBe(true);
    const sparse = complete.map(r => r.menu === "quarter-pot" && r.repetition >= 2 ? { ...r, addedSelected: false, action: { type: "check" as const }, sizing: null, payment: 0, potFraction: 0, stackFraction: 0 } : r);
    expect(analyze(sparse).shortlist.filter(s => s.menu === "quarter-pot").every(s => !s.eligibleForMatchStudy)).toBe(true);
    const failed = complete.map((r, i) => i === 0 ? { ...r, failure: "invariant", failureStage: "invariant" as const } : r);
    expect(analyze(failed).shortlist.every(s => !s.eligibleForMatchStudy)).toBe(true);
  });
  it("retains full results on provider and engine failures with first-failure classification", async () => {
    const e = p.plan[0];
    const failed = await observe({ async decide() { throw new Error("do not record raw provider text"); } }, e, p);
    expect(failed.failure).toBe("provider"); expect(failed.failureStage).toBe("provider");
    expect(JSON.stringify(failed)).not.toContain("raw provider text");
  });
  it("observes scripted real transports through frozen inputs, menus, validators and engine", async () => {
    llmEnv(); vi.stubEnv("TYPESAFE_API_KEY", "scripted-jev");
    for (const provider of ["jev", "llm"] as const) for (const menu of menus) {
      const f = p.matrix[0], e = p.plan.find(e => e.fixture === f.id && e.provider === provider && e.menu === menu)!;
      const availability = f.availability.find(a => a.menu === menu)!;
      const move = createMoveOptions(f.variants[menu], menu).find(m => availability.reason === "available" ? m.sizingChoice === availability.choice : m.choice === "check")!;
      let requests = 0;
      const bot = liveBot(provider, menu, () => { requests++; }, async (_url, init) => {
        const request = JSON.parse(String(init.body));
        const body = provider === "jev" ? scriptedAnswer(request, move.choice) : { model: "openai/gpt-5.4-mini", choices: [{ message: { content: JSON.stringify({ action: move.action.type, sizing: move.sizingChoice === "not_applicable" ? null : move.sizingChoice }) } }] };
        return new Response(JSON.stringify(body));
      });
      const result = await observe(bot, e, p);
      expect(result.failure).toBe(null); expect(result.action).toEqual(move.action); expect(requests).toBe(1);
      expect(result.addedSelected).toBe(menu !== "current");
    }
  });
  it("creates no Eevo paid client and debits exactly once before guarded transport", async () => {
    llmEnv(); vi.stubEnv("TYPESAFE_API_KEY", "scripted-jev");
    const entry = p.plan[0]; let debited = false;
    const bot = liveBot("jev", "quarter-pot", () => { expect(debited).toBe(false); debited = true; }, async (url, init) => {
      expect(debited).toBe(true); expect(url).toBe("https://api.typesafe.ai/v1/systemone");
      const request = JSON.parse(String(init.body)); return new Response(JSON.stringify(scriptedAnswer(request, Object.keys(request.questions.move.criteria)[0])));
    });
    await bot.decide(p.matrix.find(f => f.id === entry.fixture)!.context);
    expect(debited).toBe(true);
  });
});
