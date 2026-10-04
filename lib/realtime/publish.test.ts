import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishNotification } from "./publish";

const { createClient, readGame } = vi.hoisted(() => ({ createClient: vi.fn(), readGame: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: createClient, createSupabaseGameRepository: readGame }));

describe("publishNotification", () => {
  const send = vi.fn();
  const removeChannel = vi.fn();
  const channel = { send };
  beforeEach(() => {
    vi.resetAllMocks();
    send.mockResolvedValue("ok");
    removeChannel.mockResolvedValue("ok");
    createClient.mockReturnValue({ channel: vi.fn(() => channel), removeChannel });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    { type: "player_action" as const, gameId: "game-1", version: 2 },
    { type: "ai_decision" as const, gameId: "game-1", version: 3 },
    { type: "seat_name_updated" as const, gameId: "game-1" },
  ])("sends exactly $type with a five-second transport timeout and awaits cleanup", async (event) => {
    let finishCleanup!: () => void;
    removeChannel.mockReturnValue(new Promise<string>(resolve => { finishCleanup = () => resolve("ok"); }));
    let finished = false;
    const publication = publishNotification(event).then(result => { finished = true; return result; });
    await vi.waitFor(() => expect(removeChannel).toHaveBeenCalledWith(channel));
    expect(finished).toBe(false);
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "broadcast", event: event.type, payload: event }, { timeout: 5_000 });
    expect(createClient().channel).toHaveBeenCalledWith("game:game-1");
    expect(readGame).not.toHaveBeenCalled();
    finishCleanup();
    expect(await publication).toEqual({ ok: true });
  });

  it.each([
    { type: "player_action", gameId: "game-1", version: -1 },
    { type: "player_action", gameId: "game-1", version: 2, game: {} },
    { type: "seat_claimed", gameId: "game-1", version: 2 },
    { type: "seat_claimed", gameId: "game-1", seat: {} },
  ])("rejects invalid or additional outgoing fields", async (event) => {
    // Deliberately bypass the compile-time contract to exercise runtime validation.
    // @ts-expect-error invalid notification
    expect((await publishNotification(event)).ok).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each(["timed out", "error", "throw"])("handles %s with one attempt and cleanup, without leaking errors", async (result) => {
    if (result === "throw") send.mockRejectedValue(new Error("secret-key and game contents"));
    else send.mockResolvedValue(result);
    expect((await publishNotification({ type: "player_action", gameId: "game-1", version: 2 })).ok).toBe(false);
    expect(send).toHaveBeenCalledOnce();
    expect(removeChannel).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Realtime notification failed", {
      phase: "publish", type: "player_action", gameId: "game-1", version: 2, elapsedMs: expect.any(Number),
    });
  });

  it("contains client initialization and cleanup failures", async () => {
    createClient.mockImplementationOnce(() => { throw new Error("secret"); });
    expect((await publishNotification({ type: "seat_claimed", gameId: "game-1" })).ok).toBe(false);
    removeChannel.mockRejectedValueOnce(new Error("secret"));
    expect(await publishNotification({ type: "seat_claimed", gameId: "game-1" })).toEqual({ ok: true });
    expect(console.error).toHaveBeenLastCalledWith("Realtime notification failed", {
      phase: "cleanup", type: "seat_claimed", gameId: "game-1", elapsedMs: expect.any(Number),
    });
  });
});

 it("logs non-ok channel removal without throwing", async () => {
  const send = vi.fn().mockResolvedValue("ok");
  createClient.mockReturnValue({ channel: () => ({ send }), removeChannel: vi.fn().mockResolvedValue("timed out") });
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await publishNotification({ type: "seat_released", gameId: "game-1" })).toEqual({ ok: true });
  expect(console.error).toHaveBeenLastCalledWith("Realtime notification failed", {
    phase: "cleanup", type: "seat_released", gameId: "game-1", elapsedMs: expect.any(Number),
  });
});
