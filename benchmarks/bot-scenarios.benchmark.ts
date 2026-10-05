import { cappedBot, liveDecisionBudget } from "./poker-context-harness";
import { describe, expect, it } from "vitest";

import { isBotPlaystyleId, LLM_PLAYSTYLES } from "@/lib/bots/llm-playstyles";
import type { AIDifficulty, BotPlaystyleId } from "@/lib/poker/types";
import { getBotCatalog, ServerBotRegistry } from "@/lib/bots/registry";

import { evaluateScenario, scenarios } from "./scenarios/harness";

const repeats = Number(process.env.BOT_SCENARIO_REPEATS ?? "1");
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 20) {
  throw new Error("BOT_SCENARIO_REPEATS must be an integer from 1 to 20");
}

const liveEnabled = process.env.BOT_SCENARIO_LIVE === "true";
const bots = getBotCatalog();
let liveBudget: { remaining:number } | undefined;

for (const descriptor of bots) {
  const model = descriptor.modelId ? ` (${descriptor.modelId})` : "";
  describe.skipIf(descriptor.provider !== "rules" && !liveEnabled)(
    `${descriptor.id}${model}`,
    () => {
      const variants: readonly {
        label: string;
        difficulty: AIDifficulty;
        profileId?: BotPlaystyleId;
      }[] = descriptor.provider === "llm"
        ? Object.keys(LLM_PLAYSTYLES).filter(isBotPlaystyleId).map((profileId) => ({
            label: profileId,
            // LLM configuration uses playstyle; the shared context still requires difficulty.
            difficulty: "medium",
            profileId,
          }))
        : (["easy", "medium", "hard"] as const).map((difficulty) => ({
            label: difficulty,
            difficulty,
          }));

      for (const { label, difficulty, profileId } of variants) {
        describe(label, () => {
          for (const scenario of scenarios) {
            for (let attempt = 1; attempt <= repeats; attempt++) {
              const suffix = repeats > 1 ? ` (attempt ${attempt})` : "";
              it(`${scenario.id}${suffix}`, async () => {
                // Resolve only inside selected tests; skipped models never call providers.
                const { bot } = new ServerBotRegistry().get({
                  botId: descriptor.id,
                  profileId,
                });
                if (descriptor.provider !== "rules") liveBudget ??= liveDecisionBudget();
                const report = await evaluateScenario(descriptor.provider === "rules" ? bot : cappedBot(bot,liveBudget!), scenario, {
                  difficulty,
                  typesafePolicyV2: descriptor.provider === "typesafe",
                });

                expect(report.status, JSON.stringify(report, null, 2)).toBe("pass");
              });
            }
          }
        });
      }
    },
  );
}
