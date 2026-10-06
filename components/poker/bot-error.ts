import { HttpError } from "@/lib/http/api";
import { botFailureCodes } from "@/lib/http/gameplay-contracts";
import type { GameDictionary } from "@/lib/i18n/types";

const translations = {
  OWNER_AI_LIMIT: "ownerAILimit",
  GAME_AI_RATE_LIMIT: "gameAIRateLimit",
  GAME_CREATION_LIMIT: "gameCreationLimit",
  USAGE_UNAVAILABLE: "usageUnavailable",
  [botFailureCodes.timeout]: "botTimeout",
  [botFailureCodes.network]: "botNetwork",
  [botFailureCodes.rate_limit]: "botRateLimited",
  [botFailureCodes.invalid_response]: "botInvalidResponse",
  [botFailureCodes.provider]: "botProvider",
} as const satisfies Record<string, keyof GameDictionary["errors"]>;

export function botErrorMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof HttpError && error.code && Object.hasOwn(translations, error.code)) {
    return t(`errors.${translations[error.code as keyof typeof translations]}`);
  }
  return error instanceof Error ? error.message : t("errors.advanceAi");
}
