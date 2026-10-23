import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_QUERY, THEME_STORAGE_KEY } from "./preference";
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
async function setup(stored: string | null = null, blocked = false) {
  const document = { documentElement: { dataset: { theme: "" } } };
  const window = new EventTarget();
  const media = Object.assign(new EventTarget(), { matches: false });
  const storage = { getItem: vi.fn(() => { if (blocked) throw Error("blocked"); return stored; }), setItem: vi.fn(() => { if (blocked) throw Error("blocked"); }) };
  Object.assign(window, { matchMedia: vi.fn((query: string) => { expect(query).toBe(THEME_QUERY); return media; }) });
  Object.defineProperty(window, "localStorage", { get: () => { if (blocked) throw Error("blocked"); return storage; } });
  vi.stubGlobal("window", window); vi.stubGlobal("document", document);
  const controller = await import("./controller");
  const changed = vi.fn(); const unsubscribe = controller.subscribeTheme(changed);
  const storageEvent = (key: string | null, newValue: string | null) => window.dispatchEvent(Object.assign(new Event("storage"), { key, newValue, storageArea: null }));
  return { ...controller, document, media, storage, changed, unsubscribe, storageEvent };
}
describe("shared theme controller", () => {
  it("toggles from the resolved System theme and persists an explicit choice", async () => {
    const c = await setup();
    c.media.matches = true; c.media.dispatchEvent(new Event("change"));
    expect(c.getThemePreference()).toBe("system");
    expect(c.getResolvedTheme()).toBe("dark");
    expect(c.changed).toHaveBeenCalled();
    c.toggleTheme();
    expect(c.getResolvedTheme()).toBe("light");
    expect(c.storage.setItem).toHaveBeenLastCalledWith(THEME_STORAGE_KEY, "light");
    c.toggleTheme();
    expect(c.getResolvedTheme()).toBe("dark");
    expect(c.getThemePreference()).toBe("dark");
    c.unsubscribe();
  });
  it("persists independently, synchronizes subscribers and follows device changes only in System", async () => {
    const c = await setup(); const second = vi.fn(); const stop = c.subscribeTheme(second);
    c.media.matches = true; c.media.dispatchEvent(new Event("change"));
    expect(c.document.documentElement.dataset.theme).toBe("dark");
    c.setThemePreference("light");
    expect(c.storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "light");
    expect(second).toHaveBeenCalled();
    c.media.dispatchEvent(new Event("change"));
    expect(c.document.documentElement.dataset.theme).toBe("light");
    c.setThemePreference("system");
    expect(c.document.documentElement.dataset.theme).toBe("dark");
    stop(); c.unsubscribe();
  });
  it("handles other tabs, invalid values and clearing storage", async () => {
    const c = await setup("light");
    c.storageEvent("unrelated", "dark"); expect(c.getThemePreference()).toBe("light");
    c.storageEvent(THEME_STORAGE_KEY, "dark"); expect(c.getThemePreference()).toBe("dark");
    c.storageEvent(THEME_STORAGE_KEY, "bad"); expect(c.getThemePreference()).toBe("system");
    c.storageEvent(THEME_STORAGE_KEY, "dark"); c.storageEvent(null, null);
    expect(c.getThemePreference()).toBe("system");
    c.unsubscribe(); const calls = c.changed.mock.calls.length;
    c.storageEvent(THEME_STORAGE_KEY, "light"); expect(c.changed).toHaveBeenCalledTimes(calls);
  });
  it("retains in-memory choices when storage is unavailable", async () => {
    const c = await setup(null, true);
    expect(c.getThemePreference()).toBe("system");
    c.setThemePreference("dark"); expect(c.document.documentElement.dataset.theme).toBe("dark");
    expect(c.getThemePreference()).toBe("dark"); c.unsubscribe();
  });
});
