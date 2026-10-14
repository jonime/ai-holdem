import type { Reporter, TestModule, TestCase } from "vitest/node";

/** Do not let assertion diffs or database errors print fixture/private data. */
export default class PipelineReporter implements Reporter {
  onTestCaseResult(test: TestCase) {
    const result = test.result();
    console.log(`${result.state}: ${test.name}`);
    if (result.state === "failed") {
      for (const error of result.errors ?? []) {
        const label = /^Pipeline invariant: [a-zA-Z0-9 .-]+$/.test(error.message) ? error.message : "Bot pipeline assertion or operation failed";
        console.error(label);
      }
    }
  }
  onTestRunEnd(_modules: readonly TestModule[], errors: readonly unknown[]) {
    if (errors.length) console.error("Bot pipeline setup or teardown failed; verify local prerequisites and fixture cleanup.");
  }
}
