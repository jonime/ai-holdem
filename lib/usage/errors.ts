export type UsageLimitCode = "OWNER_AI_LIMIT" | "GAME_AI_RATE_LIMIT" | "GAME_CREATION_LIMIT";
export class UsageLimitError extends Error {
  constructor(readonly code: UsageLimitCode, readonly retryAfterMs: number) {
    super("Fair-use allowance reached");
  }
}
export class UsageUnavailableError extends Error {
  constructor() { super("Usage admission temporarily unavailable"); }
}
