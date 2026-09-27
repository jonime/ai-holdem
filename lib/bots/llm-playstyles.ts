import "server-only";

import type { BotPlaystyleId } from "@/lib/poker/types";

export const DEFAULT_BOT_PLAYSTYLE_ID: BotPlaystyleId = "balanced";

export const LLM_PLAYSTYLES = {
  balanced: {
    instruction:
      "Prefer the action with the highest expected chip value without a directional preference.",
  },
  tight: {
    instruction:
      "Avoid marginal high-variance continuations and require a stronger edge before committing a large fraction of the effective stack. Do not fold a clearly profitable call.",
  },
  aggressive: {
    instruction:
      "When expected values are comparable, prefer betting or raising over passive play, apply pressure with credible draws, and use larger value sizes when appropriate.",
  },
} as const satisfies Record<BotPlaystyleId, { readonly instruction: string }>;

export function isBotPlaystyleId(value: unknown): value is BotPlaystyleId {
  return typeof value === "string" && Object.hasOwn(LLM_PLAYSTYLES, value);
}

export function resolveLlmPlaystyle(id: BotPlaystyleId) {
  return LLM_PLAYSTYLES[id];
}
