import { describe, expect, it } from "vitest";

import { TypesafeSystemOneClient } from "@/lib/typesafe/client";
import { decidePokerAction } from "@/lib/typesafe/decision";

import {
  type BenchmarkPolicy,
  rulesPolicy,
  runMatchup,
  scriptedAggressivePolicy,
  scriptedPassivePolicy,
} from "./policy-harness";

const enabled = process.env.TYPESAFE_LIVE_BENCHMARK === "true";

describe("opt-in live TypeSafe benchmark", () => {
  it.skipIf(!enabled)(
    "reports actual Jev decisions separately from mocked CI checks",
    async () => {
      const client = new TypesafeSystemOneClient();
      const livePolicy: BenchmarkPolicy = {
        name: "typesafe-poker-v2-live",
        async decide(context) {
          return (await decidePokerAction(client, context)).action;
        },
      };
      const reports = [];
      for (const opponent of [
        rulesPolicy,
        scriptedPassivePolicy,
        scriptedAggressivePolicy,
      ]) {
        // Five paired seeds means ten seat-swapped hands per opponent. Increase
        // this only deliberately: every TypeSafe turn is a paid live API call.
        reports.push(await runMatchup(livePolicy, opponent, 5));
      }

      console.log(JSON.stringify({ kind: "live-typesafe", reports }, null, 2));
      expect(reports.every((report) => report.hands > 0)).toBe(true);
    },
  );
});
