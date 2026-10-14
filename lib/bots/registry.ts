import "server-only";

import { getLlmBotModels } from "@/lib/env/server";
import type { BotDescriptor } from "@/lib/poker/types";
import { TypesafeSystemOneClient } from "@/lib/typesafe/client";

import { EevoSystemOneClient } from "@/lib/eevo/client";
import { EevoPokerBot } from "./eevo";

import { EquityRulesV2Bot } from "./equity-rules-v2";
import { ConfidenceAwareJevPokerBot } from "./jev-confidence";
import { LlmPokerBot } from "./llm";
import type { PokerBot } from "./types";
import { DEFAULT_BOT_PLAYSTYLE_ID, isBotPlaystyleId } from "./llm-playstyles";

export const eevoBotDescriptor: BotDescriptor = {
  id: "eevo", label: "Upright Eevo", provider: "eevo", modelId: "eevo-1",
  configuration: { difficulty: true, playstyle: false },
};

export const jevBotDescriptor: BotDescriptor = {
  id: "jev",
  label: "TypeSafe Jev",
  provider: "typesafe",
  modelId: "jev-latest",
  configuration: { difficulty: true, playstyle: false },
};

export const equityRulesV2BotDescriptor: BotDescriptor = {
  id: "equity-rules-v2",
  label: "Equity Rules",
  provider: "rules",
  modelId: null,
  configuration: { difficulty: true, playstyle: false },
};

export function getBotCatalog(): readonly BotDescriptor[] {
  return [
    jevBotDescriptor,
    ...(process.env.EEVO_API_KEY?.trim() &&
    process.env.EEVO_API_KEY !== "your_eevo_api_key" &&
    process.env.EXTERNAL_INFERENCE_ENABLED !== "false"
      ? [eevoBotDescriptor]
      : []),
    equityRulesV2BotDescriptor,
    ...getLlmBotModels().map((model) => ({
      id: model.id,
      label: model.label,
      provider: "llm" as const,
      modelId: model.modelId,
      configuration: { difficulty: false, playstyle: true },
    })),
  ];
}

export function resolveBotDescriptor(botId: string): BotDescriptor {
  const descriptor = botId === "eevo" ? eevoBotDescriptor : getBotCatalog().find((candidate) => candidate.id === botId);

  if (!descriptor) throw new Error(`Unknown bot: ${botId}`);
  return descriptor;
}

export interface BotRegistry {
  get(selection: {
    readonly botId: string;
    readonly profileId?: string | null;
  }): {
    readonly descriptor: BotDescriptor;
    readonly bot: PokerBot;
  };
}

export class ServerBotRegistry implements BotRegistry {
  get(selection: {
    readonly botId: string;
    readonly profileId?: string | null;
  }) {
    const descriptor = resolveBotDescriptor(selection.botId);
    if (descriptor.provider !== "llm" && selection.profileId != null) {
      throw new Error("Bot playstyle is only supported by LLM bots");
    }
    if (descriptor.provider === "rules") {
      return { descriptor, bot: new EquityRulesV2Bot() };
    }
    if (descriptor.provider === "eevo") {
      return { descriptor, bot: new EevoPokerBot(new EevoSystemOneClient()) };
    }
    if (descriptor.provider === "typesafe") {
      return {
        descriptor,
        bot: new ConfidenceAwareJevPokerBot(new TypesafeSystemOneClient()),
      };
    }
    const modelDefinition = getLlmBotModels().find(
      (model) => model.id === descriptor.id,
    );
    if (!modelDefinition) throw new Error(`Unknown bot: ${selection.botId}`);
    return {
      descriptor,
      bot: new LlmPokerBot(
        modelDefinition.modelId,
        {
          profileId: isBotPlaystyleId(selection.profileId)
            ? selection.profileId
            : selection.profileId == null
              ? DEFAULT_BOT_PLAYSTYLE_ID
              : (() => {
                  throw new Error("Unknown bot playstyle");
                })(),
          reasoning: modelDefinition.reasoning,
        },
      ),
    };
  }
}
