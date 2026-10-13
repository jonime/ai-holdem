import { afterEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { usePlayerName } from "./player-name";
function Name() { return <input value={usePlayerName()} readOnly />; }
afterEach(() => vi.unstubAllGlobals());
it("server rendering never touches browser storage or a cached browser name", () => {
  const access = vi.fn(() => { throw Error("Storage unavailable"); });
  const browser = {};
  Object.defineProperty(browser, "localStorage", { get: access });
  vi.stubGlobal("window", browser);
  expect(renderToString(<Name />)).toContain('value=""');
  expect(access).not.toHaveBeenCalled();
});
