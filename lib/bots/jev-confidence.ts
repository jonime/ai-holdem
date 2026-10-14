import "server-only";
import { prepareProviderContext } from "@/lib/poker/provider-context";
import { adviceVersion, selectJevOpponentAdvice } from "@/lib/poker/opponent-advice";
import { JevPokerBot } from "./jev";
import type { BotContext } from "./types";

export const jevConfidencePolicyVersion = "typesafe-poker-v4.1-confidence";

/** Production-only Jev promotion; the original wrapper remains a benchmark baseline. */
export class ConfidenceAwareJevPokerBot extends JevPokerBot {
  override async decide(context: BotContext) {
    const prepared = prepareProviderContext(context);
    const items = selectJevOpponentAdvice(prepared);
    const supplied = { ...prepared, ...(items.length ? { opponentAdvice: { version: adviceVersion, items } } : {}) };
    const decision = await super.decide(supplied);
    return { ...decision, diagnostics: { ...decision.diagnostics, promptVersion: jevConfidencePolicyVersion } };
  }
}
