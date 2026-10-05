import "server-only";

import {
  getLlmServerEnv,
  type LlmReasoningEffort,
} from "@/lib/env/server";
import type { PokerAction } from "@/lib/poker/types";
import type { BotPlaystyleId } from "@/lib/poker/types";
import type { SizingChoice } from "@/lib/typesafe/questions";
import { prepareProviderContext } from "@/lib/poker/provider-context";
import { selectPokerAdvice } from "@/lib/poker/strategy-advice";

import {
  BotProviderError,
  emptyDiagnostics,
  type BotContext,
  type BotDecision,
  type PokerBot,
} from "./types";
import { resolveLlmPlaystyle } from "./llm-playstyles";
import { providerHttpFailureDiagnostics } from "./provider-http-failure";

const invariantPolicy =
  "Use only the supplied information and optimize expected chip value in this no-rake cash game. Choose only a supplied action candidate and, when required, a supplied sizing. The candidates already exclude provably bad decisions; playstyle preferences never override these restrictions. Showdown equity is against random opponent hands, not the opponent's betting range. Compare range-adjusted equity with the supplied contestable-pot odds. Evaluate the best five cards including kickers; a strong category on the board does not mean HERO beats the opponent. On the river no future cards remain, so do not semi-bluff missed draws. Never invent hidden cards or absent information. For fold, check, or call, sizing must be null. For bet or raise, sizing must be one of the supplied concrete sizing choices. Return only the schema-constrained JSON.";

interface FetchLike {
  (input: string, init: RequestInit): Promise<Response>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function removeEncryptedReasoning(body: unknown): unknown {
  if (!isRecord(body) || !Array.isArray(body.choices)) return body;

  return {
    ...body,
    choices: body.choices.map((choice) => {
      if (!isRecord(choice) || !isRecord(choice.message)) return choice;
      return {
        ...choice,
        message: Object.fromEntries(
          Object.entries(choice.message).filter(
            ([key]) => key !== "reasoning_details",
          ),
        ),
      };
    }),
  };
}

function parseOutput(
  body: unknown,
  context: BotContext,
): { action: PokerAction; sizingChoice: SizingChoice | null } {
  if (
    !isRecord(body) ||
    !Array.isArray(body.choices) ||
    !isRecord(body.choices[0])
  ) {
    throw new BotProviderError("LLM provider returned a malformed response");
  }
  const message = body.choices[0].message;
  if (!isRecord(message) || typeof message.content !== "string") {
    throw new BotProviderError("LLM provider returned no structured decision");
  }
  let output: unknown;
  try {
    output = JSON.parse(message.content);
  } catch {
    throw new BotProviderError("LLM provider returned invalid decision JSON");
  }
  if (!isRecord(output) || typeof output.action !== "string" ||
      Object.keys(output).length !== 2 || !("sizing" in output) ||
      Object.keys(output).some(key => key !== "action" && key !== "sizing")) {
    throw new BotProviderError("LLM provider returned an invalid decision");
  }
  const legal = context.legalActions.find(
    (action) => action.type === output.action,
  );
  if (!legal)
    throw new BotProviderError("LLM provider selected an illegal action");
  if ((legal.type === "fold" || legal.type === "check" || legal.type === "call") && output.sizing !== null) {
    throw new BotProviderError("LLM provider selected sizing for a passive action");
  }
  if (legal.type === "fold" || legal.type === "check") {
    return { action: legal, sizingChoice: null };
  }
  if (legal.type === "call") {
    return {
      action: { type: "call", amount: legal.amount },
      sizingChoice: null,
    };
  }
  if (typeof output.sizing !== "string") {
    throw new BotProviderError("LLM provider omitted a required sizing choice");
  }
  const sizing = context.sizingOptions.find(
    (option) => option.choice === output.sizing,
  );
  if (!sizing || sizing.amount === null ||
    sizing.amount < legal.minAmount || sizing.amount > legal.maxAmount) {
    throw new BotProviderError("LLM provider selected an unavailable sizing");
  }
  return {
    action: { type: legal.type, amount: sizing.amount },
    sizingChoice: sizing.choice,
  };
}

export class LlmPokerBot implements PokerBot {
  private readonly profileId: BotPlaystyleId;
  private readonly reasoning: LlmReasoningEffort;
  private readonly fetcher: FetchLike;
  private readonly guidance: boolean;

  constructor(
    private readonly modelId: string,
    profileIdOrOptionsOrFetcher:
      | BotPlaystyleId
      | {
          readonly profileId?: BotPlaystyleId;
          readonly reasoning?: LlmReasoningEffort;
          /** Benchmark ablation only; production always uses the default. */
          readonly guidance?: boolean;
        }
      | FetchLike = "balanced",
    fetcher: FetchLike = fetch,
  ) {
    this.guidance = typeof profileIdOrOptionsOrFetcher !== "object" || profileIdOrOptionsOrFetcher.guidance !== false;
    this.profileId =
      typeof profileIdOrOptionsOrFetcher === "function"
        ? "balanced"
        : typeof profileIdOrOptionsOrFetcher === "string"
          ? profileIdOrOptionsOrFetcher
          : (profileIdOrOptionsOrFetcher.profileId ?? "balanced");
    this.reasoning =
      typeof profileIdOrOptionsOrFetcher === "object"
        ? (profileIdOrOptionsOrFetcher.reasoning ?? "minimal")
        : "minimal";
    this.fetcher =
      typeof profileIdOrOptionsOrFetcher === "function"
        ? profileIdOrOptionsOrFetcher
        : fetcher;
  }

  async decide(context: BotContext): Promise<BotDecision> {
    const started = performance.now();
    const candidates = prepareProviderContext(context);
    const advice = this.guidance ? selectPokerAdvice(candidates) : null;
    const sizingChoices = candidates.sizingOptions.filter(option => option.amount !== null).map(option => option.choice);
    let response: Response;
    try {
      const { apiEndpoint, apiKey } = getLlmServerEnv();
      response = await this.fetcher(apiEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.modelId,
          reasoning: { effort: this.reasoning },
          messages: [
            {
              role: "system",
              content: `${invariantPolicy}\n\nPlaystyle preference: ${resolveLlmPlaystyle(this.profileId).instruction}\n\n${advice ? JSON.stringify(advice) : ""}`,
            },
            { role: "user", content: JSON.stringify(candidates) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "poker_decision",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["action", "sizing"],
                properties: {
                  action: {
                    type: "string",
                    enum: candidates.legalActions.map((action) => action.type),
                  },
                  sizing: {
                    type: sizingChoices.length > 0 ? ["string", "null"] : "null",
                    enum: [...sizingChoices, null],
                    description: "Null for fold, check, or call. A supplied concrete sizing choice is required for bet or raise.",
                  },
                },
              },
            },
          },
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      throw new BotProviderError(
        error instanceof Error && error.name === "TimeoutError"
          ? "LLM provider timed out"
          : "LLM provider request failed",
      );
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || (isRecord(body) && isRecord(body.error))) {
      throw new BotProviderError(
        `LLM provider request failed with HTTP ${response.status}`,
        providerHttpFailureDiagnostics(response, body),
      );
    }
    const parsed = parseOutput(body, candidates);
    const usage = isRecord(body) && isRecord(body.usage) ? body.usage : null;
    const cost = usage && typeof usage.cost === "number" ? usage.cost : null;
    return {
      action: parsed.action,
      suppliedContext: { ...candidates, strategyAdvice: advice },
      diagnostics: emptyDiagnostics({
        sizing: parsed.sizingChoice
          ? {
              choice: parsed.sizingChoice,
              probabilities: null,
              confidence: null,
            }
          : null,
        promptVersion: `llm-poker-v3.1-${this.guidance ? "guided" : "facts"}-${this.profileId}`,
        botProfileId: this.profileId,
        durationMs: Math.round(performance.now() - started),
        usage,
        cost,
      }),
      rawResponse: removeEncryptedReasoning(body),
    };
  }
}
