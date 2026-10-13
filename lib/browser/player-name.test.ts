import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { playerNameServerSnapshot, playerNameStorageKey, readPlayerName, savePlayerName, subscribePlayerName } from "./player-name";
let storage: Storage;
beforeEach(() => {
  storage = { getItem: vi.fn(() => "Old"), setItem: vi.fn() } as unknown as Storage;
  vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage: storage }));
});
afterEach(() => vi.unstubAllGlobals());
it.each(["access", "read", "write"])("preserves the latest in-memory name after %s failure", failure => {
  if (failure === "access") Object.defineProperty(window, "localStorage", { get() { throw Error(); } });
  if (failure === "read") vi.mocked(storage.getItem).mockImplementation(() => { throw Error(); });
  if (failure === "write") vi.mocked(storage.setItem).mockImplementation(() => { throw Error("quota"); });
  expect(playerNameServerSnapshot()).toBe("");
  expect(readPlayerName()).toBe(failure === "write" ? "Old" : "");
  savePlayerName("Latest");
  expect(readPlayerName()).toBe("Latest");
  expect(readPlayerName()).toBe("Latest");
});
it("notifies same-tab consumers and accepts cross-tab updates and removal", () => {
  const first = vi.fn(), second = vi.fn();
  const stop = subscribePlayerName(first), stopSecond = subscribePlayerName(second);
  savePlayerName("Ada"); expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledOnce();
  const event = (key: string | null, newValue: string | null, storageArea = storage) => window.dispatchEvent(Object.assign(new Event("storage"), { key, newValue, storageArea }));
  event("other", "Ignored"); expect(readPlayerName()).toBe("Ada");
  event(playerNameStorageKey, "Elsewhere"); expect(readPlayerName()).toBe("Elsewhere");
  event(playerNameStorageKey, null); expect(readPlayerName()).toBe("");
  event(playerNameStorageKey, "Next"); event(null, null); expect(readPlayerName()).toBe("");
  stop(); stopSecond(); first.mockClear(); savePlayerName("Later"); expect(first).not.toHaveBeenCalled();
});
it("guards storage-object access in event filtering", () => {
  const stop = subscribePlayerName(vi.fn());
  Object.defineProperty(window, "localStorage", { get() { throw Error(); } });
  expect(() => window.dispatchEvent(Object.assign(new Event("storage"), { key: playerNameStorageKey, newValue: "Other", storageArea: storage }))).not.toThrow();
  expect(readPlayerName()).toBe("Old"); stop();
});
it("keeps server reads empty without browser access", () => {
  savePlayerName("Browser"); vi.stubGlobal("window", undefined);
  expect(readPlayerName()).toBe(""); expect(playerNameServerSnapshot()).toBe("");
  expect(() => savePlayerName("Server")).not.toThrow();
});

it("loads removal during an unmounted interval without replacing failed writes", () => {
  const stop = subscribePlayerName(vi.fn()); stop();
  vi.mocked(storage.getItem).mockReturnValue(null);
  const stopNext = subscribePlayerName(vi.fn()); expect(readPlayerName()).toBe(""); stopNext();
  vi.mocked(storage.setItem).mockImplementation(() => { throw Error(); });
  savePlayerName("Memory");
  vi.mocked(storage.getItem).mockReturnValue("Stale");
  const stopLast = subscribePlayerName(vi.fn()); expect(readPlayerName()).toBe("Memory"); stopLast();
});
