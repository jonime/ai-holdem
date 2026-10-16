import "server-only";

import type { BettingMenu } from "@/lib/systemone/questions";
import { SystemOneResponseError } from "@/lib/systemone/types";
import type { SystemOneDecisionClient } from "@/lib/systemone/decision";
import { SystemOnePokerBot } from "./systemone";
import type { BotContext } from "./types";

export class EevoResponseError extends SystemOneResponseError {
  override name = "EevoResponseError";
}

export class EevoPokerBot extends SystemOnePokerBot {
  constructor(client: SystemOneDecisionClient, menu: BettingMenu = "current") {
    super(client, true, "eevo-1", menu);
  }

  override async decide(context: BotContext) {
    try {
      return await super.decide(context);
    } catch (error) {
      if (error instanceof SystemOneResponseError) {
        throw new EevoResponseError("Eevo returned an invalid decision");
      }
      throw error;
    }
  }
}
