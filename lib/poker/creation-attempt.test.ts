import { beforeEach, describe, expect, it, vi } from "vitest";
import { creationAttemptArguments } from "./creation-attempt";
const request = new Request("http://localhost/api/games");
const id = "a1111111-1111-4111-8111-111111111111";
describe("creation intent normalization", () => {
  beforeEach(() => { vi.stubEnv("USAGE_LIMIT_HASH_SECRET", "test-secret-that-is-at-least-32-bytes-long"); vi.stubEnv("USAGE_LIMIT_TEST_IP", "127.0.0.1"); });
  it("uses sanitized names and accepted custom defaults", () => {
    const first = creationAttemptArguments(request, "owner", id, { mode: "custom", hostName: " Ada " });
    expect(first.p_fingerprint).toBe(creationAttemptArguments(request, "owner", id, { mode: "custom", hostName: "Ada", seatCount: 6, humanTurnSeconds: 60 }).p_fingerprint);
    expect(first.p_fingerprint).not.toBe(creationAttemptArguments(request, "owner", id, { mode: "custom", hostName: "Ada", humanTurnSeconds: null }).p_fingerprint);
  });
  it("separates modes and owners, and ignores locale/randomization", () => {
    const first = creationAttemptArguments(request, "owner", id, { mode: "quick" });
    expect(first.p_fingerprint).toBe(creationAttemptArguments(new Request("http://localhost/fi-FI/quick-game"), "owner", id, { mode: "quick", hostName: " " }).p_fingerprint);
    expect(first.p_fingerprint).not.toBe(creationAttemptArguments(request, "owner", id, { mode: "quick", botMode: "rules" }).p_fingerprint);
    expect(first.p_owner).not.toBe(creationAttemptArguments(request, "other", id, { mode: "quick" }).p_owner);
    vi.stubEnv("USAGE_LIMIT_HASH_SECRET", "rotated-secret-at-least-32-bytes-long");
    expect(first.p_owner).toBe(creationAttemptArguments(request, "owner", id, { mode: "quick" }).p_owner);
  });
});
