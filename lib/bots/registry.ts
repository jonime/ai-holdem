import "server-only";

import { getOpenRouterProfiles } from "@/lib/env/server";
import { TypesafeSystemOneClient } from "@/lib/typesafe/client";
import type { BotDescriptor } from "@/lib/poker/types";

import { BasicEquityBot } from "./basic-equity";
import { JevPokerBot } from "./jev";
import { OpenRouterPokerBot } from "./openrouter";
import type { PokerBot } from "./types";

export const jevBotDescriptor: BotDescriptor = {
  id: "jev",
  label: "TypeSafe Jev",
  provider: "typesafe",
  modelId: "jev-latest",
};

export const basicBotDescriptor: BotDescriptor = {
  id: "basic-equity-v1",
  label: "Basic equity",
  provider: "rules",
  modelId: null,
};

export function getBotCatalog(): readonly BotDescriptor[] {
  return [
    jevBotDescriptor,
    basicBotDescriptor,
    ...getOpenRouterProfiles().map((profile) => ({
      id: profile.id,
      label: profile.label,
      provider: "openrouter" as const,
      modelId: profile.modelId,
    })),
  ];
}

export interface BotRegistry {
  get(botId: string): { readonly descriptor: BotDescriptor; readonly bot: PokerBot };
}

export class ServerBotRegistry implements BotRegistry {
  get(botId: string) {
    const descriptor = getBotCatalog().find((candidate) => candidate.id === botId);
    if (!descriptor) throw new Error(`Unknown bot: ${botId}`);
    if (descriptor.provider === "rules") {
      return { descriptor, bot: new BasicEquityBot() };
    }
    if (descriptor.provider === "typesafe") {
      return { descriptor, bot: new JevPokerBot(new TypesafeSystemOneClient()) };
    }
    return {
      descriptor,
      bot: new OpenRouterPokerBot(descriptor.modelId as string),
    };
  }
}
