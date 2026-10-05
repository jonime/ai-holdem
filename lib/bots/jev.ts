import { prepareProviderContext } from "@/lib/poker/provider-context";
import { decidePokerAction, type TypesafeDecisionClient } from "@/lib/typesafe/decision";
import { typesafePokerPolicyVersion } from "@/lib/typesafe/questions";

import { emptyDiagnostics, type BotContext, type BotDecision, type PokerBot } from "./types";

export class JevPokerBot implements PokerBot {
  constructor(private readonly client: TypesafeDecisionClient) {}

  async decide(context: BotContext): Promise<BotDecision> {
    const started = performance.now();
    const suppliedContext = prepareProviderContext(context);
    const decision = await decidePokerAction(this.client, suppliedContext);
    const audit = decision.rawResponse;
    const provider = typeof audit === "object" && audit !== null && "providerResponse" in audit ? audit.providerResponse : null;
    const usage = typeof provider === "object" && provider !== null && "usage" in provider ? provider.usage : null;
    const cost = typeof usage === "object" && usage !== null && "cost" in usage && typeof usage.cost === "number" && Number.isFinite(usage.cost) ? usage.cost : null;
    return {
      action: decision.action,
      suppliedContext,
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
        durationMs: Math.round(performance.now() - started),
        usage,
        cost,
      }),
      rawResponse: decision.rawResponse,
    };
  }
}
