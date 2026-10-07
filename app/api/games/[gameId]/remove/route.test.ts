import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { TableRemovalError } from "@/lib/poker/table-removal";
const { remove, create, invalidate, schedule } = vi.hoisted(() => ({ remove: vi.fn(), create: vi.fn(), invalidate: vi.fn(), schedule: vi.fn() }));
vi.mock("@/lib/poker/table-removal", async original => ({ ...await original<typeof import("@/lib/poker/table-removal")>(), removeTable: remove }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseGameRepository: create }));
vi.mock("@/lib/poker/public-directory-cache", () => ({ invalidatePublicDirectory: invalidate }));
vi.mock("@/lib/realtime/schedule", () => ({ scheduleSeatEvent: schedule }));
const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ gameId: id }) };
const request = (body: unknown, cookie = "ai-holdem-player-id=owner") => new Request(`http://localhost/api/games/${id}/remove`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); create.mockReturnValue({}); remove.mockResolvedValue({ version: 4 }); });
it.each([{}, { expectedVersion: 0 }, { expectedVersion: -1, operation: "delete" }, { expectedVersion: 0, operation: "hide" }, { expectedVersion: 0, operation: "delete", playerToken: "forged" }])("rejects invalid requests %j", async body => {
  expect((await POST(request(body), context)).status).toBe(400); expect(create).not.toHaveBeenCalled();
});
it.each(["", "ai-holdem-player-id=%xx"])("requires valid cookie identity %s", async cookie => {
  expect((await POST(request({ expectedVersion: 0, operation: "delete" }, cookie), context)).status).toBe(403); expect(create).not.toHaveBeenCalled();
});
it("uses cookie identity and sends only the masked result and compact refresh", async () => {
  const result = await POST(request({ expectedVersion: 3, operation: "leave_and_remove" }), context);
  expect(result.status).toBe(200); expect(await result.json()).toEqual({ version: 4 });
  expect(remove).toHaveBeenCalledWith({}, { gameId: id, playerToken: "owner", expectedVersion: 3, operation: "leave_and_remove" });
  expect(invalidate).toHaveBeenCalledOnce(); expect(schedule).toHaveBeenCalledWith(id, "seat_released");
});
it.each([["forbidden",403],["blocked",409],["conflict",409],["missing",404]] as const)("maps %s without notifications", async (outcome,status) => {
  remove.mockRejectedValue(new TableRemovalError(outcome));
  expect((await POST(request({ expectedVersion: 0, operation: "delete" }),context)).status).toBe(status);
  expect(invalidate).not.toHaveBeenCalled(); expect(schedule).not.toHaveBeenCalled();
});
it("masks unexpected database failures", async () => {
  const log = vi.spyOn(console,"error").mockImplementation(() => {});
  remove.mockRejectedValue(new Error("private-token-and-cards"));
  const result = await POST(request({ expectedVersion: 0, operation: "delete" }),context);
  expect(result.status).toBe(500); expect(await result.text()).not.toContain("private-token");
  expect(log).toHaveBeenCalledWith("Unable to remove table", { gameId: id }); log.mockRestore();
});
