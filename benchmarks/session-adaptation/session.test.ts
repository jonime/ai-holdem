import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { blocks, contextFor, deal, episodes, playHand, schedule, script, start } from "./session";
import { Ledger, BudgetExhausted } from "./storage";
import { report } from "./report";
import { authorize } from "./live";
import { pokerEngineAdapter as engine, createDeterministicDeck } from "@/lib/poker/adapter";
import { selectJevOpponentAdvice } from "@/lib/poker/opponent-advice";
import { LlmPokerBot } from "@/lib/bots/llm";
import { liveBot } from "../bet-sizing/providers";
import { createMoveOptions } from "@/lib/systemone/questions";
import { offline } from "./offline";

describe("session adaptation boundaries", () => {
  it("starts real Node entry point without credentials or inference", () => {
    expect(execFileSync(process.execPath, ["benchmarks/session-adaptation/run.mjs", "startup"], { encoding: "utf8", env: { PATH: process.env.PATH, NODE_ENV: "test" } })).toContain("no inference");
  });

  it("starts report-only without credentials or inference and writes human-readable results", () => {
    const dir = mkdtempSync(join(tmpdir(), "session-cli-"));
    try { const path = join(dir, "ledger.json"); new Ledger(path, blocks, "synthetic-freeze");
      const output = execFileSync(process.execPath, ["benchmarks/session-adaptation/run.mjs", "report", path, join(dir, "report")], { encoding: "utf8", env: { PATH: process.env.PATH, NODE_ENV: "test" } });
      expect(output).toContain("no credentials or inference clients"); expect(readFileSync(join(dir, "report.md"), "utf8")).toContain("synthetic-freeze");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("checks the LLM parser and production transport failure using only scripted HTTP", async () => {
    const saved = { EXTERNAL_INFERENCE_ENABLED: process.env.EXTERNAL_INFERENCE_ENABLED, LLM_API_KEY: process.env.LLM_API_KEY, LLM_API_ENDPOINT: process.env.LLM_API_ENDPOINT, TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY };
    Object.assign(process.env, { EXTERNAL_INFERENCE_ENABLED: "true", LLM_API_KEY: "scripted-offline", TYPESAFE_API_KEY: "scripted-offline", LLM_API_ENDPOINT: "https://openrouter.ai/api/v1/chat/completions" });
    try {
      const arm = episodes(blocks[0])[0]; const state = start(arm, blocks[0], 1);
      const context = contextFor(arm, state, { version: 0, handNumber: 1, initialState: state, actions: [] }, 5);
      const selected = createMoveOptions(context).find(m => m.action.type === "call")!;
      let calls = 0;
      const decision = await new LlmPokerBot("openai/gpt-5.4-mini", { profileId: "balanced", reasoning: "low" }, async (_url, init) => {
        calls++; const body = JSON.parse(String(init.body)); expect(body.model).toBe("openai/gpt-5.4-mini"); expect(body.reasoning.effort).toBe("low");
        expect(JSON.parse(body.messages[1].content)).toEqual(context);
        return new Response(JSON.stringify({ model: "openai/gpt-5.4-mini", choices: [{ message: { content: JSON.stringify({ action: "call", sizing: null }) } }] }));
      }).decide(context);
      expect(decision.action).toEqual(selected.action); expect(calls).toBe(1);
      let reserved = 0, dispatches = 0;
      const bot = liveBot("llm", "current", () => { reserved++; }, async () => { dispatches++; throw new Error("scripted-network-failure"); });
      await expect(bot.decide(context)).rejects.toThrow(); expect(reserved).toBe(1); expect(dispatches).toBe(1);
    } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
  });
  it("pairs decks, rotates order and does not share mutable episode history", () => {
    expect(blocks).toHaveLength(8);
    const normal = deal(31, 1, false), swapped = deal(31, 1, true);
    expect(swapped.slice(4)).toEqual(normal.slice(4)); expect(swapped[0]).toEqual(normal[1]); expect(swapped[2]).toEqual(normal[3]);
    expect(new Set(normal.map(c => c.rank + c.suit)).size).toBe(52);
    const arms = episodes(blocks[0]); expect(arms[0].history).not.toBe(arms[1].history);
    expect(schedule(0, 1)).toEqual([0, 1, 2, 3]); expect(schedule(1, 1)).toEqual([1, 0, 3, 2]);
  });
  it("omits all historical stats/advice but preserves current-hand information; hidden holdings do not enter context", () => {
    const arm = episodes(blocks[0])[0]; let state = start(arm, blocks[0], 1);
    // Ensure hero acts, without observing private cards in the script.
    const actions = [];
    const initialState = state;
    if (engine.snapshot(state).currentActorId !== "subject") { const action = script(state, blocks[0].opponent, 1, 1, 0); actions.push({ sequence: 1, action, stateBefore: state }); state = engine.applyAction(state, "opponent", action); }
    const history = { version: 0, handNumber: 1, initialState, actions };
    const enabled = contextFor(arm, state, history, 5), omitted = contextFor({ ...arm, memory: false }, state, history, 5);
    const { sessionStats, ...base } = enabled; expect(base).toEqual(omitted); expect(sessionStats?.coverage.selectedHands).toBe(0); expect(selectJevOpponentAdvice(omitted)).toEqual([]);
    const text = JSON.stringify(enabled); for (const key of ["initialState", "finalState", "engineState", "playerToken", "subject", "deck"]) expect(text).not.toContain(`"${key}"`);
    // Change only an opponent card in the full deck. Hero, board and draw
    // sequence stay fixed; production context must be identical.
    const cards = deal(blocks[0].seed, 1, false).map(c => c.rank + c.suit);
    const order = engine.decisionView(initialState).postflopOrder;
    const index = order.indexOf(engine.decisionView(initialState).players.find(p => p.id === "opponent")!.seat);
    [cards[index], cards[51]] = [cards[51], cards[index]];
    let altered = engine.startHand(arm.state, createDeterministicDeck(cards)); const alteredInitial = altered;
    const alteredActions = actions.map(item => { const before = altered; altered = engine.applyAction(altered, "opponent", item.action); return { ...item, stateBefore: before }; });
    expect(contextFor(arm, altered, { ...history, initialState: alteredInitial, actions: alteredActions }, 5)).toEqual(enabled);
  });
  it("validates natural replay, resets, rotation, omission and scripted Jev/Eevo compatibility", async () => { const result = await offline(5, 2); expect(result.providerRequests).toBe(0); expect(result.negativeControlChecks).toBeGreaterThan(0); }, 30000);
  it("never forces a result on provider failure", async () => {
    const arm = episodes(blocks[0])[0]; let completed = false;
    await expect(playHand(arm, blocks[0], 1, { async decide() { throw new Error("failure"); }, decision() {}, completed() { completed = true; } }, 5)).rejects.toThrow("failure");
    expect(completed).toBe(false); expect(arm.history).toHaveLength(0);
  });
  it("script uses legal exact calls and never reraises", () => {
    const arm = episodes(blocks[0])[0]; const state = start(arm, blocks[0], 1);
    for (let seed = 0; seed < 30; seed++) { const action = script(state, "frequent-caller", seed, 1, 0); expect(() => engine.applyAction(state, engine.snapshot(state).currentActorId!, action)).not.toThrow(); }
  });
});
describe("session request accounting", () => {
  it("requires fresh dedicated authorization without requiring Eevo", () => { expect(() => authorize({})).toThrow(); expect(() => authorize({ SESSION_ADAPTATION_AUTHORIZATION: "authorize-new-session-adaptation-4800", BOT_SCENARIO_LIVE: "true", EXTERNAL_INFERENCE_ENABLED: "true", BOT_DECISION_CALL_CAP: "5000", TYPESAFE_API_KEY: "local-real", LLM_API_KEY: "local-real", LLM_API_ENDPOINT: "https://openrouter.ai/api/v1/chat/completions" })).not.toThrow(); });
  it("reserves durably, forbids concurrent dispatch/replay, excludes whole incomplete blocks", () => {
    const dir = mkdtempSync(join(tmpdir(), "session-test-"));
    try {
      const path = join(dir, "ledger.json"), ledger = new Ledger(path, blocks, "freeze");
      const slot = ledger.reserve(blocks[0].id, "episode-memory", 1, 0);
      expect(() => ledger.reserve(blocks[0].id, "other", 1, 0)).toThrow(); ledger.complete(slot);
      expect(() => new Ledger(path, blocks, "freeze")).toThrow();
      // Allocation test avoids 600 disk flushes while exercising the same guard.
      ledger.evidence.requests = Array.from({ length: 600 }, (_, index) => ({ block: blocks[0].id, episode: "episode-memory", hand: 1, index, status: "completed" }));
      expect(() => ledger.reserve(blocks[0].id, "episode-memory", 2, 0)).toThrow(BudgetExhausted);
      ledger.evidence.blocks[0].status = "budget";
      ledger.evidence.hands.push({ block: blocks[0].id, episode: "episode-memory", hand: 1, memory: true, seat: 0, profitBB: 100 });
      const r = report(ledger.evidence); expect(r.blocks[0].differenceBB100).toBeNull(); expect(r.cells[0].independentBlocks).toBe(0);
      ledger.reserve(blocks[1].id, "other", 1, 0); // No transfer needed: independent scheduled allocation.
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("averages seats and scores complete blocks only", () => {
    const dir = mkdtempSync(join(tmpdir(), "session-report-"));
    try { const ledger = new Ledger(join(dir, "ledger.json"), blocks, "freeze"); ledger.evidence.blocks[0].status = "complete";
      for (const seat of [0, 1]) for (const memory of [true, false]) for (let hand = 1; hand <= 60; hand++) ledger.evidence.hands.push({ block: blocks[0].id, episode: `${seat}-${memory}`, seat, memory, hand, profitBB: memory ? seat + 1 : 0 });
      expect(report(ledger.evidence).blocks[0].differenceBB100).toBe(150);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
