import { decidePokerAction, type TypesafeDecisionClient } from "@/lib/typesafe/decision";
import { typesafePokerPolicyVersion } from "@/lib/typesafe/questions";

import { emptyDiagnostics, type BotContext, type BotDecision, type PokerBot } from "./types";

export class JevPokerBot implements PokerBot {
  constructor(private readonly client: TypesafeDecisionClient) {}

  async decide(context: BotContext): Promise<BotDecision> {
    const decision = await decidePokerAction(this.client, context);
    return {
      action: decision.action,
      diagnostics: emptyDiagnostics({
        probabilities: decision.probabilities,
        confidence: decision.confidence,
        sizing: decision.sizing
          ? {
              choice: decision.sizing.choice,
              probabilities: decision.sizing.probabilities,
              confidence: decision.sizing.confidence,
            }
          : null,
        promptVersion: typesafePokerPolicyVersion,
      }),
      rawResponse: decision.rawResponse,
    };
  }
}
