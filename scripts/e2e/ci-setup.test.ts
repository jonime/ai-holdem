import { expect, it, vi } from "vitest";
import { setupCI } from "./ci-setup.mjs";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it("starts both setup tasks before either finishes, retaining install coverage and deadlines", async () => {
  const browsers = deferred();
  const supabase = deferred();
  const run = vi.fn().mockReturnValueOnce(browsers.promise).mockReturnValueOnce(supabase.promise);
  const setup = setupCI(run, { CI: "true", NODE_ENV: "test" });
  expect(run).toHaveBeenCalledTimes(2);
  expect(run.mock.calls[0][1]).toEqual([expect.stringContaining("@playwright/test/cli.js"), "install", "--with-deps", "chromium", "webkit"]);
  expect(run.mock.calls[0][2]).toMatchObject({ phase: "browser-install", timeout: 480_000 });
  expect(run.mock.calls[1][1]).toEqual([expect.stringContaining("scripts/e2e/supabase.mjs")]);
  expect(run.mock.calls[1][2]).toMatchObject({ phase: "supabase-setup", timeout: 720_000 });
  browsers.resolve();
  supabase.resolve();
  await setup;
});

it.each([0, 1])("waits for the other child before reporting failure of task %i", async failed => {
  const children = [deferred(), deferred()];
  const run = vi.fn().mockReturnValueOnce(children[0].promise).mockReturnValueOnce(children[1].promise);
  const setup = setupCI(run, { CI: "true", NODE_ENV: "test" });
  let settled = false;
  const outcome = setup.then(() => { settled = true; }, error => { settled = true; return error; });
  const failure = new Error("setup task failed");
  children[failed].reject(failure);
  // Let rejection handlers run: teardown must not race the unfinished child.
  await new Promise(resolve => setImmediate(resolve));
  expect(settled).toBe(false);
  children[1 - failed].resolve();
  const error = await outcome;
  expect(error).toBeInstanceOf(AggregateError);
  expect(error.errors).toEqual([failure]);
});

it("rejects non-CI execution before starting either task", async () => {
  const run = vi.fn();
  await expect(setupCI(run, { NODE_ENV: "test" })).rejects.toThrow("CI-only");
  expect(run).not.toHaveBeenCalled();
});
