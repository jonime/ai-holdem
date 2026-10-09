export class TransportError extends Error {
  constructor(readonly kind: "deadline" | "network" | "cancelled" | "invalidResponse", message: string) {
    super(message);
    this.name = kind === "cancelled" ? "AbortError" : "TransportError";
  }
}
export const unknownOutcome = (error: unknown) => error instanceof TransportError && error.kind !== "cancelled";

/** Covers headers and body, even if an implementation fails to observe abort. */
export async function withDeadline<T>(run: (signal: AbortSignal) => Promise<T>, milliseconds: number, caller?: AbortSignal | null): Promise<T> {
  const controller = new AbortController();
  let reject!: (error: TransportError) => void;
  const interrupted = new Promise<never>((_, no) => { reject = no; });
  const stop = (kind: "deadline" | "cancelled") => {
    const error = new TransportError(kind, kind === "deadline" ? "Request deadline exceeded" : "Request cancelled");
    controller.abort(error);
    reject(error);
  };
  const cancel = () => stop("cancelled");
  const timer = setTimeout(() => stop("deadline"), milliseconds);
  caller?.addEventListener("abort", cancel, { once: true });
  try {
    if (caller?.aborted) cancel();
    return await Promise.race([interrupted, caller?.aborted ? interrupted : run(controller.signal)]);
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener("abort", cancel);
  }
}
