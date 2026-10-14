// Compatibility exports preserve the existing Jev API and error identity.
import { decidePokerAction as sharedDecidePokerAction } from "@/lib/systemone/decision";
import { SystemOneResponseError } from "@/lib/systemone/types";
import { TypesafeResponseError } from "./types";
export type { SystemOneDecisionClient as TypesafeDecisionClient, DecidePokerActionOptions } from "@/lib/systemone/decision";

export const decidePokerAction: typeof sharedDecidePokerAction = async (client, state, options) => {
  try {
    return await sharedDecidePokerAction(client, state, options);
  } catch (error) {
    if (error instanceof SystemOneResponseError) {
      throw new TypesafeResponseError(error.message.replaceAll("SystemOne", "TypeSafe"));
    }
    throw error;
  }
};
