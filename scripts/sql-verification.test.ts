import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { sqlSuites, verifySQL } from "./sql-verification.mjs";

it("preserves full SQL coverage, historical order and each suite's deadline", async () => {
  const runCommand = vi.fn().mockResolvedValue(undefined);
  await verifySQL(runCommand, { NODE_ENV: "test" }, vi.fn());
  const expected = [
    ["game-reads", 180_000], ["replay", 120_000], ["results", 120_000],
    ["shares", 120_000], ["creation", 180_000], ["my-games", 180_000],
    ["removal", 180_000], ["bot-context", 180_000], ["seats", 180_000],
    ["departures", 180_000], ["turn-timers", 120_000],
    ["bot-claims", 180_000], ["usage", 180_000],
  ];
  expect(runCommand.mock.calls).toEqual(expected.map(([suite, timeout]) => [
    "npm", ["run", `test:sql:${suite}`], { env: { NODE_ENV: "test" }, phase: `sql-${suite}`, timeout },
  ]));
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(sqlSuites.map(([suite]) => `test:sql:${suite}`).sort()).toEqual(
    Object.keys(pkg.scripts).filter(name => name.startsWith("test:sql:")).sort(),
  );
  expect(pkg.scripts["test:sql"]).toBe("node scripts/sql-verification.mjs");
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  expect(workflow).toMatch(/run: npm run db:types:check\s+- name: Verify SQL suites sequentially\s+run: npm run test:sql\s+- name: Verify external bot application pipeline/);
});

it("awaits the active suite before starting the next one", async () => {
  let finish!: () => void;
  const first = new Promise<void>(resolve => { finish = resolve; });
  const runCommand = vi.fn().mockResolvedValue(undefined).mockReturnValueOnce(first);
  const task = verifySQL(runCommand, { NODE_ENV: "test" }, vi.fn());
  expect(runCommand).toHaveBeenCalledTimes(1);
  await new Promise(resolve => setImmediate(resolve));
  expect(runCommand).toHaveBeenCalledTimes(1);
  finish();
  await task;
  expect(runCommand).toHaveBeenCalledTimes(13);
});

it.each(["sql-replay failed (exit 1)", "sql-replay failed (timeout)"])(
  "stops after %s and closes its diagnostic group",
  async message => {
    const error = new Error(message);
    const runCommand = vi.fn().mockResolvedValue(undefined)
      .mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);
    const log = vi.fn();
    await expect(verifySQL(runCommand, { GITHUB_ACTIONS: "true", NODE_ENV: "test" }, log)).rejects.toBe(error);
    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(log.mock.calls.flat()).toEqual([
      "::group::test:sql:game-reads", "::endgroup::",
      "::group::test:sql:replay", "::endgroup::",
    ]);
  },
);
