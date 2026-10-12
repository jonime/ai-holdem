/* eslint-disable react-hooks/rules-of-hooks -- External-store hook driver. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { InputHTMLAttributes, ReactElement, ChangeEvent } from "react";
import type { JoinGameDictionary } from "@/lib/i18n/types";

vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => string) => snapshot(),
}));
let storage: Storage;
beforeEach(() => {
  vi.resetModules();
  storage = { getItem: vi.fn(() => null), setItem: vi.fn() } as unknown as Storage;
  vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage: storage }));
});
afterEach(() => vi.unstubAllGlobals());
it.each(["read", "write", "access"])("keeps typing and join names usable after storage %s fails", async failure => {
  if (failure === "read") vi.mocked(storage.getItem).mockImplementation(() => { throw Error(); });
  if (failure === "write") vi.mocked(storage.setItem).mockImplementation(() => { throw Error(); });
  if (failure === "access") Object.defineProperty(window, "localStorage", { get() { throw Error(); } });
  const { PlayerName, usePlayerName } = await import("./PlayerName");
  const input = () => (PlayerName({ dictionary: {} as JoinGameDictionary }).props.children[1] as ReactElement<InputHTMLAttributes<HTMLInputElement>>).props;
  expect(input()).toMatchObject({ name: "hostName", maxLength: 30, value: "" });
  for (const value of ["A", "Ada", ""]) {
    input().onChange!({ target: { value } } as ChangeEvent<HTMLInputElement>);
    expect(input().value).toBe(value);
    expect(usePlayerName()).toBe(value);
  }
});
it("loads a remembered name and persists edits", async () => {
  vi.mocked(storage.getItem).mockReturnValue("Remembered");
  const { PlayerName } = await import("./PlayerName");
  const input = PlayerName({ dictionary: {} as JoinGameDictionary }).props.children[1] as ReactElement<InputHTMLAttributes<HTMLInputElement>>;
  expect(input.props.value).toBe("Remembered");
  input.props.onChange!({ target: { value: "Ada" } } as ChangeEvent<HTMLInputElement>);
  expect(storage.setItem).toHaveBeenCalledWith("ai-holdem-player-name", "Ada");
});
