import { describe, expect, it } from "vitest";

import {
  frozenPolicyV1,
  rulesPolicy,
  runMatchup,
  scriptedAggressivePolicy,
  scriptedPassivePolicy,
  upgradedPolicyV2,
} from "./policy-harness";

describe("mocked seeded TypeSafe policy benchmark", () => {
  it("reports paired, seat-swapped comparisons without claiming live strength", async () => {
    const reports = [];
    for (const policy of [frozenPolicyV1, upgradedPolicyV2]) {
      for (const opponent of [
        rulesPolicy,
        scriptedPassivePolicy,
        scriptedAggressivePolicy,
      ]) {
        reports.push(await runMatchup(policy, opponent));
      }
    }

    console.log(JSON.stringify({ kind: "mocked-offline", reports }, null, 2));
    expect(reports).toHaveLength(6);
    expect(reports.every((report) => report.hands > 0)).toBe(true);
    expect(reports.every((report) => report.confidence95.length === 2)).toBe(true);
    expect(reports.every((report) => report.failures === 0)).toBe(true);
  });
});
