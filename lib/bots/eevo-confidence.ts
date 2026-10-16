import "server-only";
import { prepareProviderContext } from "@/lib/poker/provider-context";
import { withConfidenceOpponentAdvice } from "@/lib/poker/opponent-advice";
import { EevoPokerBot } from "./eevo";
import type { BotContext } from "./types";

export const eevoConfidencePolicyVersion = "eevo-poker-v4.1-confidence";

/** Eevo shares Jev's confidence and sizing advice while retaining its own transport/errors. */
export class ConfidenceAwareEevoPokerBot extends EevoPokerBot {
  override async decide(context: BotContext) {
    const supplied = withConfidenceOpponentAdvice(prepareProviderContext(context, this.menu));
    const decision = await super.decide(supplied);
    return { ...decision, diagnostics: { ...decision.diagnostics, promptVersion: eevoConfidencePolicyVersion } };
  }
}
