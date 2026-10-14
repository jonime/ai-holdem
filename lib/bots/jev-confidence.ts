import "server-only";
import { prepareProviderContext } from "@/lib/poker/provider-context";
import { withConfidenceOpponentAdvice } from "@/lib/poker/opponent-advice";
import { JevPokerBot } from "./jev";
import type { BotContext } from "./types";

export const jevConfidencePolicyVersion = "typesafe-poker-v4.1-confidence";

/** Production-only Jev promotion; the original wrapper remains a benchmark baseline. */
export class ConfidenceAwareJevPokerBot extends JevPokerBot {
  override async decide(context: BotContext) {
    const prepared = prepareProviderContext(context);
    const supplied = withConfidenceOpponentAdvice(prepared);
    const decision = await super.decide(supplied);
    return { ...decision, diagnostics: { ...decision.diagnostics, promptVersion: jevConfidencePolicyVersion } };
  }
}
