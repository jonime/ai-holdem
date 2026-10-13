export class CreationAttemptError extends Error {
  constructor(readonly code: "CREATION_ATTEMPT_CONFLICT" | "CREATION_ATTEMPT_UNAVAILABLE") {
    super(code);
  }
}
