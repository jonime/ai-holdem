export class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly retryAfterMs?: number, readonly requestReference?: string) {
    super(message);
    this.name = "HttpError";
  }
}
