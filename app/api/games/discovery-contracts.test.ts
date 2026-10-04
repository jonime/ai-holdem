import { beforeEach, expect, it, vi } from "vitest";
import { POST as join } from "./[gameId]/join/route";
import { PATCH as publication } from "./[gameId]/publication/route";
import { POST as heartbeat } from "./[gameId]/heartbeat/route";
import { joinResponseSchema, publicationResponseSchema, heartbeatResponseSchema } from "@/lib/http/discovery-contracts";
import { GameConflictError } from "@/lib/supabase/queries";
const { joining, publish, renew } = vi.hoisted(() => ({ joining: vi.fn(), publish: vi.fn(), renew: vi.fn() }));
vi.mock("@/lib/poker/directory", () => ({ joinPublicGame: joining, setGamePublication: publish }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseGameRepository: () => ({ renewGameListingLease: renew }) }));
vi.mock("@/lib/poker/public-directory-cache", () => ({ invalidatePublicDirectory: vi.fn() }));
vi.mock("@/lib/realtime/schedule", () => ({ scheduleSeatEvent: vi.fn() }));
const context = { params: Promise.resolve({ gameId: "game-1" }) };
const request = (body: unknown = {}) => new Request("http://localhost/api/games/game-1", { method: "POST", body: JSON.stringify(body), headers: { cookie: "ai-holdem-player-id=owner" } });
beforeEach(() => { vi.clearAllMocks(); joining.mockResolvedValue({ outcome: "joined", seat: 2, version: 3 }); publish.mockResolvedValue({ version: 3 }); renew.mockResolvedValue(true); });
it("validates joined output and identity cookie", async () => {
  const response = await join(request({ expectedVersion: 2, name: "Ada" }), context);
  expect(response.status).toBe(200);
  joinResponseSchema.parse(await response.json());
  expect(response.headers.get("set-cookie")).toContain("ai-holdem-player-id=owner");
});
it.each([["conflict", 409, "GAME_CONFLICT"], ["unavailable", 410, "GAME_UNAVAILABLE"]])("preserves %s join code and cookie", async (outcome, status, code) => {
  joining.mockResolvedValue({ outcome });
  const response = await join(request({ expectedVersion: 2 }), context);
  expect(response.status).toBe(status);
  expect(await response.json()).toHaveProperty("code", code);
  expect(response.headers.get("set-cookie")).toContain("ai-holdem-player-id=owner");
});
it("validates publication output", async () => { publicationResponseSchema.parse(await (await publication(request({ expectedVersion: 2, isPublic: true, title: "  Title  " }), context)).json()); expect(publish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: "  Title  " })); });
it("preserves publication authorization and conflict", async () => {
  publish.mockRejectedValue(new Error("Only the host can change publication"));
  expect((await publication(request({ expectedVersion: 2, isPublic: true }), context)).status).toBe(403);
  publish.mockRejectedValue(new GameConflictError("game-1", 2));
  expect(await (await publication(request({ expectedVersion: 2, isPublic: true }), context)).json()).toHaveProperty("code", "GAME_CONFLICT");
});
it("rejects missing versions and long trimmed titles", async () => {
  expect((await join(request(), context)).status).toBe(400);
  expect((await publication(request({ isPublic: true }), context)).status).toBe(400);
  expect((await publication(request({ expectedVersion: 2, isPublic: true, title: "x".repeat(61) }), context)).status).toBe(400);
  expect(joining).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
});
it("validates version-free heartbeat and its failure code", async () => {
  const response = await heartbeat(request(), context);
  heartbeatResponseSchema.parse(await response.json());
  expect(renew).toHaveBeenCalledWith("game-1", "owner");
  renew.mockResolvedValue(false);
  const failure = await heartbeat(request(), context);
  expect(failure.status).toBe(409);
  expect(await failure.json()).toHaveProperty("code", "LISTING_NOT_RENEWABLE");
});
