import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { advanceDepartureResponseSchema, GAME_VERSION_CONFLICT } from "@/lib/http/gameplay-contracts";
import { BotStepForbiddenError } from "@/lib/poker/driver-authorization";
import { GameConflictError } from "@/lib/supabase/queries";
import { gameplayGame } from "@/test/fixtures/gameplay";
const { advance, schedule, invalidate } = vi.hoisted(() => ({ advance: vi.fn(), schedule: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/poker/game-service", async original => ({ ...await original<typeof import("@/lib/poker/game-service")>(), advanceDeparture: advance }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseGameRepository: () => ({}) }));
vi.mock("@/lib/realtime/schedule", () => ({ scheduleGameEvent: schedule }));
vi.mock("@/lib/poker/public-directory-cache", () => ({ invalidatePublicDirectory: invalidate }));
const context = { params: Promise.resolve({ gameId: "game-1" }) };
const request = (body: unknown) => new Request("http://localhost/api/games/game-1/advance-departure", {
  method: "POST", headers: { cookie: "ai-holdem-player-id=owner" }, body: JSON.stringify(body),
});
beforeEach(() => { vi.clearAllMocks(); advance.mockResolvedValue(gameplayGame); });
it("returns the standard game envelope and schedules only a committed compact event", async () => {
  const response = await POST(request({ expectedVersion: 2 }), context);
  expect(response.status).toBe(200); advanceDepartureResponseSchema.parse(await response.json());
  expect(advance).toHaveBeenCalledExactlyOnceWith({}, "game-1", 2, "owner");
  expect(schedule).toHaveBeenCalledExactlyOnceWith("game-1", "player_action", 2);
});
it.each([{}, { expectedVersion: -1 }, { expectedVersion: 1, playerId: "other" }, { expectedVersion: 1, action: { type: "fold" } }])("rejects caller-selected actors/actions and invalid versions", async body => {
  expect((await POST(request(body), context)).status).toBe(400);
  expect(advance).not.toHaveBeenCalled(); expect(schedule).not.toHaveBeenCalled();
});
it.each([new BotStepForbiddenError(), new GameConflictError("game-1", 2)])("does not notify on unauthorized or conflicting requests", async error => {
  advance.mockRejectedValue(error);
  const response = await POST(request({ expectedVersion: 2 }), context);
  expect(response.status).toBe(error instanceof BotStepForbiddenError ? 403 : 409);
  if (response.status === 409) expect(await response.json()).toMatchObject({ code: GAME_VERSION_CONFLICT });
  expect(schedule).not.toHaveBeenCalled(); expect(invalidate).not.toHaveBeenCalled();
});
it("invalidates candidates when a fold completes the hand and releases seats", async () => {
  advance.mockResolvedValue({ ...gameplayGame, status: "complete", version: 3 });
  expect((await POST(request({ expectedVersion: 2 }), context)).status).toBe(200);
  expect(invalidate).toHaveBeenCalledOnce(); expect(schedule).toHaveBeenCalledWith("game-1", "hand_completed", 3);
});
