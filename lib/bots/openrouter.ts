import "server-only";

import { getOpenRouterApiKey } from "@/lib/env/server";
import type { PokerAction } from "@/lib/poker/types";
import type { SizingChoice } from "@/lib/typesafe/questions";

import {
  BotProviderError,
  emptyDiagnostics,
  type BotContext,
  type BotDecision,
  type PokerBot,
} from "./types";

const endpoint = "https://openrouter.ai/api/v1/chat/completions";
const promptVersion = "openrouter-poker-v1";

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
    throw new BotProviderError("OpenRouter returned a malformed response");
  }
  const message = body.choices[0].message;
  if (!isRecord(message) || typeof message.content !== "string") {
    throw new BotProviderError("OpenRouter returned no structured decision");
  }
  let output: unknown;
  try {
    output = JSON.parse(message.content);
  } catch {
    throw new BotProviderError("OpenRouter returned invalid decision JSON");
  }
  if (!isRecord(output) || typeof output.action !== "string") {
    throw new BotProviderError("OpenRouter returned an invalid decision");
  }
  const legal = context.legalActions.find(
    (action) => action.type === output.action,
  );
  if (!legal)
    throw new BotProviderError("OpenRouter selected an illegal action");
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
    throw new BotProviderError("OpenRouter omitted a required sizing choice");
  }
  const sizing = context.sizingOptions.find(
    (option) => option.choice === output.sizing,
  );
  if (!sizing || sizing.amount === null) {
    throw new BotProviderError("OpenRouter selected an unavailable sizing");
  }
  return {
    action: { type: legal.type, amount: sizing.amount },
    sizingChoice: sizing.choice,
  };
}

export class OpenRouterPokerBot implements PokerBot {
  constructor(
    private readonly modelId: string,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async decide(context: BotContext): Promise<BotDecision> {
    const started = performance.now();
    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getOpenRouterApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.modelId,
          reasoning: { effort: "minimal" },
          messages: [
            {
              role: "system",
              content:
                "Choose the highest expected-chip-value legal poker action. Use equity, pot odds, effective stacks, board texture, position, and action history. Never assume hidden cards or information absent from the supplied state. Return only the requested JSON.",
            },
            { role: "user", content: JSON.stringify(context) },
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
                    enum: context.legalActions.map((action) => action.type),
                  },
                  sizing: {
                    type: ["string", "null"],
                    enum: [
                      ...context.sizingOptions.map((option) => option.choice),
                      null,
                    ],
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
          ? "OpenRouter timed out"
          : "OpenRouter request failed",
      );
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new BotProviderError(
        `OpenRouter request failed with HTTP ${response.status}`,
      );
    }
    const parsed = parseOutput(body, context);
    const usage = isRecord(body) && isRecord(body.usage) ? body.usage : null;
    const cost = usage && typeof usage.cost === "number" ? usage.cost : null;
    return {
      action: parsed.action,
      diagnostics: emptyDiagnostics({
        sizing: parsed.sizingChoice
          ? {
              choice: parsed.sizingChoice,
              probabilities: null,
              confidence: null,
            }
          : null,
        promptVersion,
        durationMs: Math.round(performance.now() - started),
        usage,
        cost,
      }),
      rawResponse: removeEncryptedReasoning(body),
    };
  }
}
