import { beforeEach, describe, expect, it, vi } from "vitest";
const { create, admit, repository } = vi.hoisted(() => ({ create: vi.fn(), admit: vi.fn(), repository: vi.fn(() => ({})) }));
vi.mock("@/lib/usage/creation", () => ({ admitGameCreation: admit }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseGameRepository: repository }));
vi.mock("@/lib/poker/game-service", async importOriginal => ({ ...await importOriginal<object>(), createDemoGame: create, createQuickPlayGame: create }));
import { POST as custom } from "./route";
import { POST as quick } from "@/app/[lang]/quick-game/route";
import { CreationAttemptError } from "@/lib/poker/creation-attempt-errors";
import { UsageLimitError } from "@/lib/usage/errors";
const id = "a1111111-1111-4111-8111-111111111111";
const req = (body: unknown, cookie = true) => new Request("http://localhost/quick-game", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", ...(cookie ? { cookie: "ai-holdem-player-id=owner" } : {}) }, body: JSON.stringify(body) });
const modes = [custom, (request: Request) => quick(request, { params: Promise.resolve({ lang: "en-US" }) }), (request: Request) => quick(new Request(request.url + "?botMode=rules", request), { params: Promise.resolve({ lang: "fi-FI" }) })];
describe.each(modes)("enhanced creation route %s", post => {
  beforeEach(() => { vi.clearAllMocks(); create.mockResolvedValue({ gameId: "game-id" }); vi.stubEnv("USAGE_LIMIT_HASH_SECRET", "test-secret-that-is-at-least-32-bytes-long"); vi.stubEnv("USAGE_LIMIT_TEST_IP", "127.0.0.1"); });
  it("uses atomic admission and keeps envelopes/cookies", async () => {
    const response = await post(req({ creationAttemptId: id, hostName: " Ada " }));
    expect(response.status).toBe(201); expect(await response.json()).toEqual({ gameId: "game-id" });
    expect(admit).not.toHaveBeenCalled(); expect(repository).toHaveBeenCalledWith(expect.objectContaining({ p_attempt_id: id, p_owner: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    expect(create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ hostName: " Ada ", hostToken: "owner" }));
    expect(response.headers.get("set-cookie")).toContain("ai-holdem-player-id=owner");
  });
  it("requires an existing cookie and validates IDs", async () => {
    expect((await post(req({ creationAttemptId: id }, false))).status).toBe(400);
    expect((await post(req({ creationAttemptId: "invalid" }))).status).toBe(400);
    expect(create).not.toHaveBeenCalled(); expect(admit).not.toHaveBeenCalled();
  });
  it.each([['CREATION_ATTEMPT_CONFLICT',409],['CREATION_ATTEMPT_UNAVAILABLE',410]] as const)("maps %s", async (code,status) => {
    create.mockRejectedValueOnce(new CreationAttemptError(code));
    const response = await post(req({ creationAttemptId: id }));
    expect(response.status).toBe(status); expect(await response.json()).toMatchObject({ code });
  });
  it("keeps allowance denials structured", async () => {
    create.mockRejectedValueOnce(new UsageLimitError("GAME_CREATION_LIMIT",1000));
    const response = await post(req({ creationAttemptId: id }));
    expect(response.status).toBe(429); expect(await response.json()).toMatchObject({ code: "GAME_CREATION_LIMIT",retryAfterMs:1000 });
  });
  it("preserves legacy admission", async () => {
    expect((await post(req({}))).status).toBe(201); expect(admit).toHaveBeenCalledOnce();
    expect(repository).toHaveBeenCalledWith(undefined);
  });
});


it("legacy JSON Quick Play retains ignored names and malformed/bodyless compatibility", async () => {
  vi.clearAllMocks(); create.mockResolvedValue({ gameId: "game-id" });
  for (const body of ["", "invalid-json", JSON.stringify({ hostName: 123 })]) {
    const response = await quick(new Request("http://localhost/quick-game", { method: "POST", headers: { accept: "application/json", "content-type": "application/json", cookie: "ai-holdem-player-id=owner" }, body }), { params: Promise.resolve({ lang: "en-US" }) });
    expect(response.status).toBe(201);
    expect(create).toHaveBeenLastCalledWith(expect.anything(), { hostToken: "owner" });
  }
});
