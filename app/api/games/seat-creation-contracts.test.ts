vi.mock("@/lib/usage/creation", () => ({ admitGameCreation: vi.fn(async () => {}) }));
import { beforeEach, expect, it, vi } from "vitest";
import { POST as claim } from "./[gameId]/seats/[seat]/claim/route";
import { POST as release } from "./[gameId]/seats/[seat]/release/route";
import { PATCH as rename } from "./[gameId]/seats/[seat]/name/route";
import { POST as assign } from "./[gameId]/seats/[seat]/assign-bot/route";
import { POST as create } from "./route";
import { POST as quick } from "@/app/[lang]/quick-game/route";
import { seatResponseSchema } from "@/lib/http/seat-contracts";
import { createGameResponseSchema, quickPlayResponseSchema } from "@/lib/http/creation-contracts";
const { mutate, creation } = vi.hoisted(() => ({ mutate: vi.fn(), creation: vi.fn() }));
vi.mock("@/lib/poker/seat-service", () => ({ claimSeat: mutate, releaseSeat: mutate, assignBotToSeat: mutate }));
vi.mock("@/lib/poker/game-service", async original => ({ ...await original<typeof import("@/lib/poker/game-service")>(), updatePlayerName: mutate, createDemoGame: creation, createQuickPlayGame: creation }));
vi.mock("@/lib/bots/registry", () => ({ getBotCatalog: () => [{ id: "jev", label: "Jev", provider: "typesafe", modelId: null }] }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseGameRepository: () => ({}) }));
vi.mock("@/lib/realtime/schedule", () => ({ scheduleSeatEvent: vi.fn() }));
vi.mock("@/lib/poker/public-directory-cache", () => ({ invalidatePublicDirectory: vi.fn() }));
const seat = { gameId: "game-1", seat: 0, name: "Ada", status: "claimed", controller: "human", playerToken: "owner", isHost: true };
const context = { params: Promise.resolve({ gameId: "game-1", seat: "0" }) };
const cases = [{ handler: claim, body: { expectedVersion: 1 } }, { handler: release, body: { expectedVersion: 1 } }, { handler: rename, body: { name: "Ada" } }, { handler: assign, body: { expectedVersion: 1 } }];
function request(body: unknown = {}, accept?: string) { return new Request("http://localhost/api/games", { method: "POST", body: JSON.stringify(body), headers: { cookie: "ai-holdem-player-id=owner", ...(accept ? { accept } : {}) } }); }
beforeEach(() => { mutate.mockReset(); mutate.mockResolvedValue(seat); creation.mockReset(); creation.mockResolvedValue({ gameId: "game-1" }); });
it.each(cases)("validates actual seat output $handler.name", async ({ handler, body }) => {
  const response = await handler(request(body), context);
  expect(response.status).toBe(200);
  expect(seatResponseSchema.parse(await response.json()).seat.playerToken).toBe("owner");
  if (handler === claim) expect(response.headers.get("set-cookie")).toContain("ai-holdem-player-id=owner");
});
it.each(cases)("rejects invalid seat path $handler.name", async ({ handler, body }) => {
  expect((await handler(request(body), { params: Promise.resolve({ gameId: "game-1", seat: "-1" }) })).status).toBe(400);
  expect(mutate).not.toHaveBeenCalled();
});
it.each([release, rename, assign])("preserves ownership rejection", async handler => {
  mutate.mockRejectedValue(new Error(handler === assign ? "Only the host can assign bots" : "Seat does not belong to this player"));
  expect((await handler(request({ expectedVersion: 1, name: "Ada" }), context)).status).toBe(403);
});
it.each([claim, release, assign])("retains GAME_CONFLICT", async handler => {
  mutate.mockRejectedValue(Object.assign(new Error("stale"), { name: "GameConflictError" }));
  const response = await handler(request({ expectedVersion: 1 }), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Game changed", code: "GAME_CONFLICT" });
});
it("creates with unchanged defaults and cookies", async () => {
  const response = await create(new Request("http://localhost/api/games", { method: "POST", headers: { cookie: "ai-holdem-player-id=owner" } }));
  expect(response.status).toBe(201);
  createGameResponseSchema.parse(await response.json());
  expect(creation).toHaveBeenCalledWith({}, { hostToken: "owner", hostName: undefined, seatCount: undefined });
  expect(response.headers.get("set-cookie")).toContain("last-visited-game-id=game-1");
});
it("validates Quick Play JSON and retains form redirects", async () => {
  const params = { params: Promise.resolve({ lang: "fi-FI" }) };
  const response = await quick(request({}, "application/json"), params);
  expect(response.status).toBe(201);
  quickPlayResponseSchema.parse(await response.json());
  expect(response.headers.get("set-cookie")).toContain("ai-holdem-player-id=owner");
  const form = await quick(request(), params);
  expect(form.status).toBe(303);
  expect(form.headers.get("location")).toBe("http://localhost/fi-FI/game/game-1");
});

it.each([
  [{}, "Invalid expected version"],
  [{ expectedVersion: 1, botId: 12 }, "Invalid bot ID"],
  [{ expectedVersion: 1, botId: "unknown" }, "Unknown bot ID"],
  [{ expectedVersion: 1, botProfileId: "loose" }, "Invalid bot playstyle"],
  [{ expectedVersion: 1, botProfileId: "tight" }, "Bot playstyle is only supported by LLM bots"],
  [{ expectedVersion: 1, difficulty: "impossible" }, "Invalid AI difficulty"],
])("preserves bot assignment input errors %j", async (body, error) => {
  const response = await assign(request(body), context);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error });
  expect(mutate).not.toHaveBeenCalled();
});
it("preserves optional claim name normalization", async () => {
  expect((await claim(request({ expectedVersion: 1, name: 12 }), context)).status).toBe(200);
  expect(mutate).toHaveBeenCalledWith({}, expect.objectContaining({ playerName: undefined, expectedVersion: 1 }));
});
it.each([null, 1, 7, "6", 2.5])("rejects invalid creation seat count %s", async seatCount => {
  const response = await create(request({ seatCount }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "seatCount must be an integer from 2 through 6" });
  expect(creation).not.toHaveBeenCalled();
});
it("preserves creation optional-name normalization and supplied seat count", async () => {
  const response = await create(request({ seatCount: 4, hostName: 12 }));
  expect(response.status).toBe(201);
  createGameResponseSchema.parse(await response.json());
  expect(creation).toHaveBeenCalledWith({}, { seatCount: 4, hostName: undefined, hostToken: "owner" });
});
it.each([claim, release, assign])("rejects missing seat mutation versions", async handler => {
  expect((await handler(request({}), context)).status).toBe(400);
  expect(mutate).not.toHaveBeenCalled();
});
