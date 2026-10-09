const suites = { smoke: "@smoke", ui: "@ui-regression", ci: "@smoke|@ui-regression" };

/** Keep local Playwright filters, but lock the combined run to complete coverage. */
export function selectionArguments(suite, args = []) {
  if (!Object.hasOwn(suites, suite)) throw new Error(`Unknown production browser suite: ${suite}`);
  if (suite === "ci" && args.some(arg => arg !== "--list")) {
    throw new Error("The combined CI suite accepts only --list; selection overrides are forbidden.");
  }
  if (args.some(arg => arg.split("=")[0] === "--pass-with-no-tests")) {
    throw new Error("An empty production browser selection must fail.");
  }
  const override = args.some(arg => arg === "--grep" || arg.startsWith("--grep=") || arg === "-g" || arg.startsWith("-g="));
  return [...(override ? [] : ["--grep", suites[suite]]), ...args];
}
