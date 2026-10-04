import { z } from "zod";
import {
  gameParamsSchema, getGameResponseSchema, submitActionRequestSchema,
  submitActionResponseSchema, stepBotRequestSchema, stepBotResponseSchema,
  type GameParams, type SubmitActionRequest, type StepBotRequest,
} from "./gameplay-contracts";

export class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "HttpError";
  }
}

type Options = { readonly signal?: AbortSignal };
function gameUrl(params: GameParams) {
  return `/api/games/${encodeURIComponent(gameParamsSchema.parse(params).gameId)}`;
}
async function send<S extends z.ZodType>(url: string, schema: S, init: RequestInit): Promise<z.output<S>> {
  const response = await fetch(url, { ...init, credentials: "same-origin" });
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (init.signal?.aborted) throw error;
    if (response.ok) throw new Error("Invalid response payload");
  }
  init.signal?.throwIfAborted();
  if (!response.ok) {
    const failure = z.object({ error: z.string().optional(), code: z.string().optional() }).safeParse(body);
    throw new HttpError(failure.success ? failure.data.error ?? "Request failed" : "Request failed",
      response.status, failure.success ? failure.data.code : undefined);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("Invalid response payload");
  return parsed.data;
}
export const api = {
  games: {
    get(params: GameParams, options: Options = {}) {
      return send(gameUrl(params), getGameResponseSchema, { cache: "no-store", signal: options.signal });
    },
    submitAction(params: GameParams & SubmitActionRequest, options: Options = {}) {
      return send(`${gameUrl(params)}/action`, submitActionResponseSchema, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitActionRequestSchema.parse(params)), signal: options.signal,
      });
    },
    stepBot(params: GameParams & StepBotRequest, options: Options = {}) {
      return send(`${gameUrl(params)}/step`, stepBotResponseSchema, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stepBotRequestSchema.parse(params)), signal: options.signal,
      });
    },
  },
};
