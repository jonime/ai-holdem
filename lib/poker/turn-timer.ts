export class TurnTimerError extends Error {
  constructor(readonly code: "TURN_EXPIRED" | "TURN_NOT_EXPIRED" | "TURN_FORBIDDEN", readonly retryAfterMs?: number) {
    super(code);
    this.name = "TurnTimerError";
  }
}
