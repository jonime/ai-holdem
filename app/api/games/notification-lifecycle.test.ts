import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as action } from "./[gameId]/action/route";
import { POST as step } from "./[gameId]/step/route";
import { POST as start } from "./[gameId]/start/route";
import { POST as nextHand } from "./[gameId]/next-hand/route";
import { POST as reveal } from "./[gameId]/reveal/route";
import { PATCH as settings } from "./[gameId]/settings/route";
import { PATCH as seatCount } from "./[gameId]/seat-count/route";
import { POST as claim } from "./[gameId]/seats/[seat]/claim/route";
import { POST as release } from "./[gameId]/seats/[seat]/release/route";
import { POST as assign } from "./[gameId]/seats/[seat]/assign-bot/route";
import { PATCH as name } from "./[gameId]/seats/[seat]/name/route";
import { POST as join } from "./[gameId]/join/route";

const { mutation, afterMock, publish, readSeats } = vi.hoisted(() => ({ mutation: vi.fn(), afterMock: vi.fn(), publish: vi.fn(), readSeats: vi.fn() }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: afterMock }));
vi.mock("@/lib/realtime/publish", async original => ({ ...await original<typeof import("@/lib/realtime/publish")>(), publishNotification: publish }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseGameRepository: () => ({ getSeatAssignments: readSeats }) }));
vi.mock("@/lib/poker/public-directory-cache", () => ({ invalidatePublicDirectory: vi.fn() }));
vi.mock("@/lib/poker/directory", () => ({ joinPublicGame: mutation }));
vi.mock("@/lib/bots/catalog", () => ({ getBotCatalog: () => [{ id: "equity-rules-v2", provider: "rules" }] }));
vi.mock("@/lib/poker/game-service", async original => ({
  ...await original<typeof import("@/lib/poker/game-service")>(),
  submitHumanAction: mutation, stepBotAction: mutation, startGame: mutation, startNextHand: mutation,
  revealHumanCards: mutation, updateTableSettings: mutation, updateSeatCount: mutation,
  claimSeat: mutation, releaseSeat: mutation, assignBotToSeat: mutation, updatePlayerName: mutation,
}));

const game = { id: "game-1", version: 8, poker: { street: "preflop", players: [{ playerToken: "private", holeCards: ["As", "Ks"] }] } };
const assignment = { gameId: "game-1", seat: 0, playerToken: "private", name: "Ada" };
const input = { expectedVersion: 7, handNumber: 1, action: { type: "check" }, seatCount: 4, smallBlind: 25, bigBlind: 50, startingStack: 5000, botsShowUncontestedWins: false, name: "Ada", botId: "equity-rules-v2" };
const cases = [
  { route: "action", handler: action, result: game, response: { game }, type: "player_action", version: 8 },
  { route: "step", handler: step, result: { game, aiDecision: { action: "check" } }, response: { game, aiDecision: { action: "check" } }, type: "ai_decision", version: 8 },
  { route: "start", handler: start, result: game, response: { game }, type: "hand_started", version: 8 },
  { route: "next-hand", handler: nextHand, result: game, response: { game }, type: "hand_started", version: 8 },
  { route: "reveal", handler: reveal, result: game, response: { game }, type: "cards_revealed", version: 8 },
  { route: "settings", handler: settings, result: game, response: { game }, type: "table_settings_updated", version: 8 },
  { route: "seat-count", handler: seatCount, result: game, response: { game }, type: "seat_count_updated", version: 8 },
  { route: "claim", handler: claim, result: assignment, response: { seat: assignment }, type: "seat_claimed" },
  { route: "release", handler: release, result: assignment, response: { seat: assignment }, type: "seat_released" },
  { route: "assign", handler: assign, result: assignment, response: { seat: assignment }, type: "seat_bot_assigned" },
  { route: "name", handler: name, result: assignment, response: { seat: assignment }, type: "seat_name_updated" },
  { route: "join", handler: join, result: { outcome: "joined", seat: 0, version: 8, duplicate: false }, response: { gameId: "game-1", seat: 0, version: 8 }, type: "seat_claimed" },
];
const context = { params: Promise.resolve({ gameId: "game-1", seat: "0" }) };
function request() { return new Request("http://localhost/api/games/game-1", { method: "POST", headers: { cookie: "ai-holdem-player-id=private" }, body: JSON.stringify(input) }); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
describe.each(cases)("$route notification lifecycle", ({ handler, result, response: body, type, version }) => {
  it("returns the unchanged HTTP data before publication and contains delivery failures", async () => {
    mutation.mockResolvedValue(result);
    publish.mockRejectedValue(new Error("transport unavailable"));
    const response = await handler(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(afterMock).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
    await expect(afterMock.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(publish).toHaveBeenCalledExactlyOnceWith({ type, gameId: "game-1", ...(version === undefined ? {} : { version }) });
    expect(readSeats).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
  it("does not schedule rejected mutations", async () => {
    mutation.mockRejectedValue(new Error("mutation rejected"));
    expect((await handler(request(), context)).ok).toBe(false);
    expect(afterMock).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
  it("preserves success when after registration fails", async () => {
    mutation.mockResolvedValue(result);
    afterMock.mockImplementation(() => { throw new Error("after unavailable"); });
    const response = await handler(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(publish).not.toHaveBeenCalled();
  });
});

it.each(["conflict", "unavailable"])("does not schedule a %s public join", async outcome => {
  mutation.mockResolvedValue({ outcome });
  expect((await join(request(), context)).ok).toBe(false);
  expect(afterMock).not.toHaveBeenCalled();
});

it.each([action, step])("announces committed completed hands", async handler => {
  const completed = { ...game, poker: { ...game.poker, street: "complete" } };
  mutation.mockResolvedValue(handler === action ? completed : { game: completed, aiDecision: {} });
  expect((await handler(request(), context)).status).toBe(200);
  await afterMock.mock.calls[0][0]();
  expect(publish).toHaveBeenCalledWith({ type: "hand_completed", gameId: "game-1", version: 8 });
});
