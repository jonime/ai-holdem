/* eslint-disable react-hooks/rules-of-hooks -- Browser-effect hook driver. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], setStatus: vi.fn(), createClient: vi.fn() }));
vi.mock("react", () => ({
  useEffect(effect: () => void | (() => void)) { h.effects.push(effect); },
  useRef(value: unknown) { return { current: value }; },
  useState(initial: () => unknown) { return [initial(), h.setStatus]; },
}));
vi.mock("./client", () => ({ createSupabaseBrowserClient: h.createClient }));
import { useGameChannel } from "./useGameChannel";
const gameId = "PRIVATE_TABLE_IDENTIFIER";
beforeEach(() => { h.effects = []; vi.clearAllMocks(); });
afterEach(() => vi.restoreAllMocks());
function connect() {
  useGameChannel(gameId, 1, vi.fn());
  h.effects.forEach(effect => effect());
}
it("logs fixed text on setup failure and retains error status", async () => {
  const sink = vi.spyOn(console, "error").mockImplementation(() => {});
  const serializer = vi.fn();
  h.createClient.mockImplementation(() => { throw Object.assign(new Error("PRIVATE_EXCEPTION"), { toJSON: serializer }); });
  connect();
  await Promise.resolve();
  expect(h.setStatus).toHaveBeenLastCalledWith("error");
  expect(sink).toHaveBeenCalledExactlyOnceWith("Unable to connect to game Realtime channel");
  expect(serializer).not.toHaveBeenCalled();
});
it.each(["CHANNEL_ERROR", "TIMED_OUT"])("logs fixed text for %s and retains recovery transitions", status => {
  const sink = vi.spyOn(console, "error").mockImplementation(() => {});
  let notify!: (status: string) => void;
  const channel = { on: vi.fn(), subscribe: vi.fn((callback: typeof notify) => { notify = callback; }) };
  channel.on.mockReturnValue(channel);
  h.createClient.mockReturnValue({ channel: () => channel, removeChannel: vi.fn() });
  connect();
  notify(status);
  expect(h.setStatus).toHaveBeenLastCalledWith("error");
  expect(sink).toHaveBeenCalledExactlyOnceWith("Game Realtime channel is unavailable");
  expect(JSON.stringify(sink.mock.calls)).not.toContain(gameId);
  notify("SUBSCRIBED");
  expect(h.setStatus).toHaveBeenLastCalledWith("subscribed");
});
