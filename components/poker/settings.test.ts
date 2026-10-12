import { expect, it, vi } from "vitest";
import { defaultSettings, parseSettings, readSettings, settingsStorageKey, settingsCodec, writeSettings } from "./settings";
it("validates the full versioned preference and defaults invalid entries", () => {
  for (const raw of [null, "", "true", "null", "[]", "{", '{"version":2,"turnSound":true,"gameplayShortcuts":false}', '{"version":1,"turnSound":"true","gameplayShortcuts":true}', '{"version":1,"turnSound":true}']) {
    expect(parseSettings(raw)).toEqual(defaultSettings);
  }
  expect(parseSettings('{"version":1,"turnSound":true,"gameplayShortcuts":false,"language":"fi-FI"}'))
    .toEqual({ version: 1, turnSound: true, gameplayShortcuts: false });
});
it("reads only the shared key and ignores a legacy sound preference", () => {
  const getItem = vi.fn((key: string) => key === "ai-holdem-turn-sound" ? "true" : null);
  expect(readSettings({ getItem })).toEqual(defaultSettings);
  expect(getItem).toHaveBeenCalledExactlyOnceWith(settingsStorageKey);
});
it("tolerates storage failures and writes one complete entry", () => {
  expect(readSettings({ getItem() { throw Error(); } })).toEqual(defaultSettings);
  expect(() => writeSettings({ setItem() { throw Error(); } }, defaultSettings)).not.toThrow();
  const setItem = vi.fn(); writeSettings({ setItem }, defaultSettings);
  expect(setItem).toHaveBeenCalledWith(settingsStorageKey, JSON.stringify(defaultSettings));
});

it("codec round-trips settings and validates both directions", () => {
  const value = { version: 1, turnSound: true, gameplayShortcuts: false } as const;
  expect(settingsCodec.decode(settingsCodec.encode(value))).toEqual(value);
  expect(settingsCodec.safeDecode("{").success).toBe(false);
  expect(settingsCodec.safeDecode('{"version":2,"turnSound":true,"gameplayShortcuts":false}').success).toBe(false);
  expect(settingsCodec.safeEncode({ ...value, turnSound: "true" } as unknown as typeof value).success).toBe(false);
});
