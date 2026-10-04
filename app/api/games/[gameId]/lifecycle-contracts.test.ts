import { beforeEach, expect, it, vi } from "vitest";
import { POST as start } from "./start/route";
import { POST as nextHand } from "./next-hand/route";
import { POST as reveal } from "./reveal/route";
import { PATCH as settings } from "./settings/route";
import { PATCH as seatCount } from "./seat-count/route";
import { lifecycleResponseSchema } from "@/lib/http/gameplay-contracts";
import { errorEnvelopeSchema } from "@/lib/http/common-contracts";
import { gameplayGame as game } from "@/test/fixtures/gameplay";
import { GameConflictError } from "@/lib/supabase/queries";
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/lib/poker/game-service", async original => ({
  ...await original<typeof import("@/lib/poker/game-service")>(),
  startGame: mutate, startNextHand: mutate, revealHumanCards: mutate,
  updateTableSettings: mutate, updateSeatCount: mutate,
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseGameRepository: () => ({}) }));
vi.mock("@/lib/realtime/schedule", () => ({ scheduleGameEvent: vi.fn() }));
vi.mock("@/lib/poker/public-directory-cache", () => ({ invalidatePublicDirectory: vi.fn() }));
const context = { params: Promise.resolve({ gameId: "game-1" }) };
const cases = [
  { handler: start, body: { expectedVersion: 1 } },
  { handler: nextHand, body: { expectedVersion: 1 } },
  { handler: reveal, body: { expectedVersion: 1, handNumber: 1 } },
  { handler: settings, body: { expectedVersion: 1, seatCount: 6, smallBlind: 25, bigBlind: 50, startingStack: 1000, botsShowUncontestedWins: false } },
  { handler: seatCount, body: { expectedVersion: 1, seatCount: 6 } },
];
const request = (body: unknown) => new Request("http://localhost/api/games/game-1", { method: "POST", body: JSON.stringify(body), headers: { cookie: "ai-holdem-player-id=owner" } });
beforeEach(() => { mutate.mockReset(); mutate.mockResolvedValue(game); });
it.each(cases)("validates actual lifecycle success $handler.name", async ({ handler, body }) => {
  const response = await handler(request(body), context);
  expect(response.status).toBe(200);
  lifecycleResponseSchema.parse(await response.json());
});
it.each(cases)("rejects missing versions $handler.name", async ({ handler, body }) => {
  const response = await handler(request({ ...body, expectedVersion: undefined }), context);
  expect(response.status).toBe(400);
  errorEnvelopeSchema.parse(await response.json());
  expect(mutate).not.toHaveBeenCalled();
});
it.each(cases)("preserves stale conflicts $handler.name", async ({ handler, body }) => {
  mutate.mockRejectedValue(new GameConflictError("game-1", 1));
  const response = await handler(request(body), context);
  expect(response.status).toBe(409);
  expect(errorEnvelopeSchema.parse(await response.json()).code).toBeUndefined();
});
it.each([
  { handler: start, body: { expectedVersion: 1 }, message: "Only the host can start the game" },
  { handler: settings, body: cases[3].body, message: "Only the host can change table settings" },
  { handler: seatCount, body: cases[4].body, message: "Only the host can change the seat count" },
  { handler: reveal, body: { expectedVersion: 1, handNumber: 1 }, message: "Only a participating human can show cards" },
])("preserves authorization response $message", async ({ handler, body, message }) => {
  mutate.mockRejectedValue(new Error(message));
  const response = await handler(request(body), context);
  expect(response.status).toBe(handler === reveal ? 400 : 403);
  errorEnvelopeSchema.parse(await response.json());
});
