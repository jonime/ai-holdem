import { BotStepInProgressError, BotStepClaimLostError } from "@/lib/poker/bot-step-claims";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { POST as action } from "./action/route";
import { POST as step } from "./step/route";
import { GameConflictError } from "@/lib/supabase/queries";
import { HumanActionError } from "@/lib/poker/human-actions";
import { BotProviderError } from "@/lib/bots/types";
import { providerHttpFailureDiagnostics } from "@/lib/bots/provider-http-failure";
import { TypesafeRequestError } from "@/lib/typesafe/client";
import { getGameResponseSchema, submitActionResponseSchema, stepBotResponseSchema, GAME_VERSION_CONFLICT } from "@/lib/http/gameplay-contracts";
import { gameplayGame as game, gameplayDecision as aiDecision } from "@/test/fixtures/gameplay";

const { read, submit, advance, schedule } = vi.hoisted(() => ({ read: vi.fn(), submit: vi.fn(), advance: vi.fn(), schedule: vi.fn() }));
vi.mock("@/lib/poker/game-service", async original => ({
  ...await original<typeof import("@/lib/poker/game-service")>(),
  getPublicGame: read, submitHumanAction: submit, stepBotAction: advance,
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseGameRepository: () => ({}) }));
vi.mock("@/lib/realtime/schedule", () => ({ scheduleGameEvent: schedule }));
const context = { params: Promise.resolve({ gameId: "game-1" }) };
function request(body: unknown) {
  return new Request("http://localhost/api/games/game-1", {
    method: "POST", headers: { cookie: "ai-holdem-player-id=owner" }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  read.mockResolvedValue(game);
  submit.mockResolvedValue(game);
  advance.mockResolvedValue({ game, aiDecision });
});

describe("gameplay route contracts", () => {
  it("validates actual refresh output and retains identity cookie and viewer projection", async () => {
    const response = await GET(new Request("http://localhost/api/games/game-1", { headers: { cookie: "ai-holdem-player-id=owner" } }), context);
    expect(response.status).toBe(200);
    const parsed = getGameResponseSchema.parse(await response.json());
    expect(parsed.game.poker.players[0].holeCards).toEqual(game.poker.players[0].holeCards);
    expect(read).toHaveBeenCalledWith({}, "game-1", "owner");
    expect(response.headers.get("set-cookie")).toContain("ai-holdem-player-id=owner");
  });
  it.each([
    { type: "fold" }, { type: "check" }, { type: "call" },
    { type: "call", amount: 50 }, { type: "bet", amount: 100 }, { type: "raise", amount: 200 },
  ])("accepts $type and validates its actual response", async proposed => {
    const response = await action(request({ expectedVersion: 1, action: proposed }), context);
    expect(response.status).toBe(200);
    submitActionResponseSchema.parse(await response.json());
    expect(submit).toHaveBeenCalledWith({}, "game-1", { expectedVersion: 1, playerId: "owner", action: proposed });
    expect(schedule).toHaveBeenCalledWith("game-1", "player_action", 2);
  });
  it.each([null, -1, 0.5, "50", Number.MAX_SAFE_INTEGER + 1, {}, true])("rejects invalid supplied call amount %s", async amount => {
    const response = await action(request({ expectedVersion: 1, action: { type: "call", amount } }), context);
    expect(response.status).toBe(400);
    expect(submit).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });
  it.each([undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", null])("rejects invalid mutation version %s", async expectedVersion => {
    for (const handler of [action, step]) {
      expect((await handler(request({ expectedVersion, action: { type: "check" } }), context)).status).toBe(400);
    }
    expect(submit).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });
  it.each([{ type: "all_in" }, { type: "bet" }, { type: "raise" }, { type: "bet", amount: -1 }, { type: "raise", amount: "20" }])("rejects invalid action %s", async proposed => {
    expect((await action(request({ expectedVersion: 1, action: proposed }), context)).status).toBe(400);
    expect(submit).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON on both mutations", async () => {
    for (const handler of [action, step]) {
      expect((await handler(new Request("http://localhost/api/games/game-1", { method: "POST", body: "broken" }), context)).status).toBe(400);
    }
  });
  it("validates the actual bot response including preflop sizing", async () => {
    advance.mockResolvedValue({ game, aiDecision: { ...aiDecision, sizing: { choice: "two_big_blinds", probabilities: null, confidence: null } } });
    const response = await step(request({ expectedVersion: 1 }), context);
    expect(response.status).toBe(200);
    stepBotResponseSchema.parse(await response.json());
    expect(advance).toHaveBeenCalledWith({}, expect.any(Object), "game-1", 1, "owner");
  });
  it("adds codes only to stale-version conflicts", async () => {
    submit.mockRejectedValue(new HumanActionError("Game version is stale"));
    advance.mockRejectedValue(new GameConflictError("game-1", 1));
    for (const handler of [action, step]) {
      const response = await handler(request({ expectedVersion: 1, action: { type: "check" } }), context);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "Game version conflict", code: GAME_VERSION_CONFLICT });
    }
    submit.mockRejectedValue(new GameConflictError("game-1", 1));
    expect(await (await action(request({ expectedVersion: 1, action: { type: "fold" } }), context)).json()).toHaveProperty("code", GAME_VERSION_CONFLICT);
    advance.mockRejectedValue(new Error("It is not a bot turn"));
    const unrelated = await step(request({ expectedVersion: 1 }), context);
    expect(unrelated.status).toBe(409);
    expect(await unrelated.json()).toEqual({ error: "It is not a bot turn" });
    expect(schedule).not.toHaveBeenCalled();
  });
  it("preserves provider failures", async () => {
    advance.mockRejectedValue(new BotProviderError("provider failed secret-body"));
    const warn = vi.spyOn(console,"warn").mockImplementation(() => {});
    const response = await step(request({ expectedVersion: 1 }), context);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "AI decision failed", code: "BOT_PROVIDER_ERROR" });
    expect(warn).toHaveBeenCalledWith("Bot decision failed", JSON.stringify({ event:"bot_decision_failed",gameId:"game-1",reason:"unknown",category:"provider" }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-body");
    warn.mockRestore();
  });
  it("logs searchable LLM credit failures while keeping the public response generic", async () => {
    const diagnostics = providerHttpFailureDiagnostics(new Response(null, { status: 402 }), {
      error: { code: 402, message: "Insufficient credits secret-body", metadata: { raw: "As Ks" } },
    });
    advance.mockRejectedValue(new BotProviderError("LLM provider request failed with HTTP 402", diagnostics));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const response = await step(request({ expectedVersion: 1 }), context);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "AI decision failed", code: "BOT_PROVIDER_ERROR" });
      expect(warn).toHaveBeenCalledExactlyOnceWith("Bot decision failed", JSON.stringify({
        event: "llm_provider_http_failure", gameId: "game-1", reason: "http_402", ...diagnostics, category: "provider",
      }));
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret-body|As Ks|owner/);
      expect(schedule).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
  it("logs searchable Jev HTTP failures without exposing raw messages", async () => {
    const diagnostics = providerHttpFailureDiagnostics(new Response(null, { status: 402 }), {
      error: "Credits exhausted secret-body As Ks",
    });
    advance.mockRejectedValue(new TypesafeRequestError("TypeSafe request failed with HTTP 402", diagnostics));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const response = await step(request({ expectedVersion: 1 }), context);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "AI decision failed", code: "BOT_PROVIDER_ERROR" });
      expect(warn).toHaveBeenCalledExactlyOnceWith("Bot decision failed", JSON.stringify({
        event: "typesafe_provider_http_failure", gameId: "game-1", reason: "typesafe_request", ...diagnostics, category: "provider",
      }));
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret-body|As Ks|owner/);
      expect(schedule).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
  it.each([
    ["timeout", "BOT_TIMEOUT"], ["network", "BOT_NETWORK_ERROR"],
    ["rate_limit", "BOT_RATE_LIMITED"], ["invalid_response", "BOT_INVALID_RESPONSE"],
    ["provider", "BOT_PROVIDER_ERROR"],
  ] as const)("returns safe %s failures without success notifications", async (category, code) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      advance.mockRejectedValue(new BotProviderError("private provider text", undefined, { category }));
      const response = await step(request({ expectedVersion: 1 }), context);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "AI decision failed", code });
      expect(schedule).not.toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toContain("private provider text");
    } finally { warn.mockRestore(); }
  });

});

it.each([
  { error: new BotStepInProgressError(90_000), body: { error: "Bot step in progress", code: "BOT_STEP_IN_PROGRESS", retryAfterMs: 90_000 } },
  { error: new BotStepClaimLostError(), body: { error: "Bot step claim lost", code: "BOT_STEP_CLAIM_LOST" } },
])("returns neutral claim conflicts without scheduling notifications", async ({ error, body }) => {
  advance.mockRejectedValue(error);
  const response = await step(request({ expectedVersion: 1 }), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual(body);
  expect(schedule).not.toHaveBeenCalled();
});
