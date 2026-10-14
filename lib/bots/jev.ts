import { SystemOnePokerBot } from "./systemone";
import { SystemOneResponseError } from "@/lib/systemone/types";
import { TypesafeResponseError } from "@/lib/typesafe/types";
import type { BotContext } from "./types";

export class JevPokerBot extends SystemOnePokerBot {
  override async decide(context: BotContext) {
    try {
      return await super.decide(context);
    } catch (error) {
      if (error instanceof SystemOneResponseError) {
        throw new TypesafeResponseError(error.message.replaceAll("SystemOne", "TypeSafe"));
      }
      throw error;
    }
  }
}
