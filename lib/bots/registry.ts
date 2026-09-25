import "server-only";

import { getOpenRouterProfiles } from "@/lib/env/server";
import type { BotDescriptor } from "@/lib/poker/types";
import { TypesafeSystemOneClient } from "@/lib/typesafe/client";

import { BasicEquityBot } from "./basic-equity";
import { EquityRulesV2Bot } from "./equity-rules-v2";
import { JevPokerBot } from "./jev";
import { OpenRouterPokerBot } from "./openrouter";
import type { PokerBot } from "./types";

export const jevBotDescriptor: BotDescriptor = {
  id: "jev",
  label: "TypeSafe Jev",
  provider: "typesafe",
  modelId: "jev-latest",
};

export const equityRulesV2BotDescriptor: BotDescriptor = {
  id: "equity-rules-v2",
  label: "Equity Rules",
  provider: "rules",
  modelId: null,
};

export const legacyBasicEquityBotDescriptor: BotDescriptor = {
  id: "basic-equity-v1",
  label: "Basic equity",
  provider: "rules",
  modelId: null,
};

export function getBotCatalog(): readonly BotDescriptor[] {
  return [
    jevBotDescriptor,
    legacyBasicEquityBotDescriptor,
    equityRulesV2BotDescriptor,
    ...getOpenRouterProfiles().map((profile) => ({
      id: profile.id,
      label: profile.label,
      provider: "openrouter" as const,
      modelId: profile.modelId,
    })),
  ];
}

export function resolveBotDescriptor(botId: string): BotDescriptor {
  const descriptor =
    getBotCatalog().find((candidate) => candidate.id === botId) ??
    (botId === legacyBasicEquityBotDescriptor.id
      ? legacyBasicEquityBotDescriptor
      : null);

  if (!descriptor) throw new Error(`Unknown bot: ${botId}`);
  return descriptor;
}

export interface BotRegistry {
  get(botId: string): {
    readonly descriptor: BotDescriptor;
    readonly bot: PokerBot;
  };
}

export class ServerBotRegistry implements BotRegistry {
  get(botId: string) {
    const descriptor = resolveBotDescriptor(botId);
    if (descriptor.id === legacyBasicEquityBotDescriptor.id) {
      return { descriptor, bot: new BasicEquityBot() };
    }
    if (descriptor.provider === "rules") {
      return { descriptor, bot: new EquityRulesV2Bot() };
    }
    if (descriptor.provider === "typesafe") {
      return {
        descriptor,
        bot: new JevPokerBot(new TypesafeSystemOneClient()),
      };
    }
    return {
      descriptor,
      bot: new OpenRouterPokerBot(descriptor.modelId as string),
    };
  }
}
