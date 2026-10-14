import { prepareProviderContext } from "@/lib/poker/provider-context";
import { decidePokerAction, type TypesafeDecisionClient } from "./decision-v3";
import { typesafePokerPolicyVersion } from "./questions-v3";

import { emptyDiagnostics, type BotContext, type BotDecision, type PokerBot } from "@/lib/bots/types";

export class JevPokerBot implements PokerBot {
  constructor(private readonly client: TypesafeDecisionClient) {}

  async decide(context: BotContext): Promise<BotDecision> {
    const started = performance.now();
    const prepared = prepareProviderContext(context);
    const { sessionStats: _sessionStats, strategyAdvice: _strategyAdvice, ...original } = prepared;
    const { dealtPlayerCount: _dealt, playersRemaining: _remaining, ...situation } = original.situation ?? {};
    void [_sessionStats, _strategyAdvice, _dealt, _remaining];
    const suppliedContext = { ...original, situation: original.situation ? situation as typeof original.situation : undefined };
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
