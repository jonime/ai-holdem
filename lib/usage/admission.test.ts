import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { admitCreation, admitInference } from "./admission";
import { UsageLimitError, UsageUnavailableError } from "./errors";
import { errorEnvelopeSchema } from "@/lib/http/common-contracts";
import { BotStepClaimLostError } from "@/lib/poker/bot-step-claims";
const rpc = vi.fn();
const input = { gameId: "game", expectedVersion: 2, claimToken: "claim", hostToken: "durable-host" };
beforeEach(() => { vi.stubEnv("USAGE_LIMIT_HASH_SECRET", "test-only-32-byte-secret-for-usage-tests"); rpc.mockReset(); rpc.mockResolvedValue({ data: { outcome: "admitted" }, error: null }); });
afterEach(() => vi.unstubAllEnvs());
it("uses durable host hashes and common creation counters without raw identities", async () => {
  await admitInference({ rpc }, input);
  const args = rpc.mock.calls[0][1];
  expect(args.p_owner_allowance).toBe(600);
  expect(args.p_game_allowance).toBe(30);
  expect(JSON.stringify(args)).not.toContain("durable-host");
  vi.stubEnv("USAGE_LIMIT_TEST_IP", "127.0.0.1");
  for (const url of ["/api/games", "/en-US/quick-game", "/en-US/quick-game?botMode=rules"]) await admitCreation({ rpc }, new Request(`http://localhost${url}`), "durable-host");
  expect(rpc.mock.calls[1][1]).toEqual(rpc.mock.calls[2][1]);
  expect(rpc.mock.calls[2][1]).toEqual(rpc.mock.calls[3][1]);
});
it("fails closed for missing owners, rejected storage and malformed responses", async () => {
  await expect(admitInference({ rpc }, { ...input, hostToken: null })).rejects.toBeInstanceOf(UsageUnavailableError);
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockRejectedValueOnce(new Error("storage"));
  await expect(admitInference({ rpc }, input)).rejects.toBeInstanceOf(UsageUnavailableError);
  rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(admitInference({ rpc }, input)).rejects.toBeInstanceOf(UsageUnavailableError);
  rpc.mockResolvedValueOnce({ error: { message: "BOT_STEP_CLAIM_LOST" } });
  await expect(admitInference({ rpc }, input)).rejects.toBeInstanceOf(BotStepClaimLostError);
});
it("preserves typed denials and one-hour waits while keeping busy claims bounded", async () => {
  rpc.mockResolvedValue({ data: { outcome: "denied", code: "OWNER_AI_LIMIT", retryAfterMs: 3_600_000 }, error: null });
  await expect(admitInference({ rpc }, input)).rejects.toMatchObject(new UsageLimitError("OWNER_AI_LIMIT", 3_600_000));
  expect(errorEnvelopeSchema.safeParse({ code: "OWNER_AI_LIMIT", retryAfterMs: 3_600_000 }).success).toBe(true);
  expect(errorEnvelopeSchema.safeParse({ code: "BOT_STEP_IN_PROGRESS", retryAfterMs: 90_001 }).success).toBe(false);
  expect(errorEnvelopeSchema.safeParse({ code: "OWNER_AI_LIMIT" }).success).toBe(false);
});
