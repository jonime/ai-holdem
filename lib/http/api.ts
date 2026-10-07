import { addLocalePrefix } from "@/lib/i18n";
import { z } from "zod";
import { errorEnvelopeSchema, type GameParams, type VersionRequest } from "./common-contracts";
import {
  gameParamsSchema, getGameResponseSchema, submitActionRequestSchema,
  submitActionResponseSchema, stepBotRequestSchema, stepBotResponseSchema,
  startRequestSchema, nextHandRequestSchema, revealRequestSchema,
  settingsRequestSchema, seatCountRequestSchema, lifecycleResponseSchema,
  type SubmitActionRequest, type StepBotRequest, type RevealRequest,
  type SettingsRequest, type SeatCountRequest,
} from "./gameplay-contracts";
import {
  createGameRequestSchema, createGameResponseSchema, quickPlayParamsSchema,
  quickPlayResponseSchema, botCatalogResponseSchema,
  type CreateGameRequest, type QuickPlayParams,
} from "./creation-contracts";
import {
  seatParamsSchema, claimSeatRequestSchema, releaseSeatRequestSchema,
  renameSeatRequestSchema, assignBotRequestSchema, seatResponseSchema,
  type SeatParams, type ClaimSeatRequest, type RenameSeatRequest, type AssignBotRequest,
} from "./seat-contracts";
import {
  feedQuerySchema, feedResponseSchema,
  type FeedQuery,
} from "./feed-contracts";
import {
  myGamesResponseSchema, directoryQuerySchema, directoryResponseSchema, joinRequestSchema,
  publicationRequestSchema, joinResponseSchema, publicationResponseSchema,
  heartbeatResponseSchema, type DirectoryQuery, type JoinRequest, type PublicationRequest,
} from "./discovery-contracts";

export class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly retryAfterMs?: number) {
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
    if (init.signal?.aborted) {
      init.signal.throwIfAborted();
      throw error;
    }
    if (response.ok) throw new Error("Invalid response payload");
  }
  init.signal?.throwIfAborted();
  if (!response.ok) {
    const failure = errorEnvelopeSchema.safeParse(body);
    if (!failure.success && typeof body === "object" && body !== null && "code" in body && typeof body.code === "string" && ["BOT_STEP_IN_PROGRESS", "OWNER_AI_LIMIT", "GAME_AI_RATE_LIMIT", "GAME_CREATION_LIMIT"].includes(body.code)) throw new Error("Invalid error response payload");
    throw new HttpError(
      failure.success ? failure.data.error ?? "Request failed" : "Request failed",
      response.status,
      failure.success ? failure.data.code : undefined,
      failure.success ? failure.data.retryAfterMs : undefined,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("Invalid response payload");
  return parsed.data;
}
function mutation<S extends z.ZodType>(
  params: GameParams,
  suffix: string,
  body: unknown,
  schema: z.ZodType,
  response: S,
  options: Options,
  method = "POST",
) {
  return send(`${gameUrl(params)}/${suffix}`, response, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(schema.parse(body)),
    signal: options.signal,
  });
}

function seatMutation(
  params: SeatParams,
  suffix: string,
  body: unknown,
  schema: z.ZodType,
  options: Options,
  method = "POST",
) {
  const { gameId, seat } = seatParamsSchema.parse(params);
  return mutation({ gameId }, `seats/${seat}/${suffix}`, body, schema, seatResponseSchema, options, method);
}

function queryString(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return query.size ? `?${query}` : "";
}

export const api = {
  bots: {
    catalog(options: Options = {}) {
      return send("/api/bots", botCatalogResponseSchema, { cache: "no-store", signal: options.signal });
    },
  },
  discovery: {
    mine(options: Options = {}) {
      return send("/api/games/mine", myGamesResponseSchema, { cache: "no-store", signal: options.signal });
    },
    join({ gameId, ...body }: GameParams & JoinRequest, options: Options = {}) {
      return mutation({ gameId }, "join", body, joinRequestSchema, joinResponseSchema, options);
    },
    publication({ gameId, ...body }: GameParams & PublicationRequest, options: Options = {}) {
      return mutation({ gameId }, "publication", body, publicationRequestSchema, publicationResponseSchema, options, "PATCH");
    },
    heartbeat(params: GameParams, options: Options = {}) {
      return send(`${gameUrl(params)}/heartbeat`, heartbeatResponseSchema, { method: "POST", signal: options.signal });
    },
    list(query: DirectoryQuery = {}, options: Options = {}) {
      return send(`/api/games/public${queryString(directoryQuerySchema.parse(query))}`, directoryResponseSchema, { cache: "no-store", signal: options.signal });
    },
  },
  creation: {
    custom(body: CreateGameRequest = {}, options: Options = {}) {
      return send("/api/games", createGameResponseSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createGameRequestSchema.parse(body)), signal: options.signal });
    },
    quickPlay(params: QuickPlayParams, options: Options = {}) {
      const parsed = quickPlayParamsSchema.parse(params);
      return send(addLocalePrefix(`/quick-game${queryString({ botMode: parsed.botMode })}`, parsed.lang), quickPlayResponseSchema, { method: "POST", headers: { Accept: "application/json" }, signal: options.signal });
    },
  },
  seats: {
    claim({ gameId, seat, ...body }: SeatParams & ClaimSeatRequest, options: Options = {}) {
      return seatMutation({ gameId, seat }, "claim", body, claimSeatRequestSchema, options);
    },
    release({ gameId, seat, ...body }: SeatParams & VersionRequest, options: Options = {}) {
      return seatMutation({ gameId, seat }, "release", body, releaseSeatRequestSchema, options);
    },
    rename({ gameId, seat, ...body }: SeatParams & RenameSeatRequest, options: Options = {}) {
      return seatMutation({ gameId, seat }, "name", body, renameSeatRequestSchema, options, "PATCH");
    },
    assignBot({ gameId, seat, ...body }: SeatParams & AssignBotRequest, options: Options = {}) {
      return seatMutation({ gameId, seat }, "assign-bot", body, assignBotRequestSchema, options);
    },
  },
  games: {
    feed({ gameId, ...query }: GameParams & FeedQuery, options: Options = {}) {
      return send(`${gameUrl({ gameId })}/feed${queryString(feedQuerySchema.parse(query))}`, feedResponseSchema, { cache: "no-store", signal: options.signal });
    },
    start({ gameId, ...body }: GameParams & VersionRequest, options: Options = {}) {
      return mutation({ gameId }, "start", body, startRequestSchema, lifecycleResponseSchema, options);
    },
    nextHand({ gameId, ...body }: GameParams & VersionRequest, options: Options = {}) {
      return mutation({ gameId }, "next-hand", body, nextHandRequestSchema, lifecycleResponseSchema, options);
    },
    reveal({ gameId, ...body }: GameParams & RevealRequest, options: Options = {}) {
      return mutation({ gameId }, "reveal", body, revealRequestSchema, lifecycleResponseSchema, options);
    },
    settings({ gameId, ...body }: GameParams & SettingsRequest, options: Options = {}) {
      return mutation({ gameId }, "settings", body, settingsRequestSchema, lifecycleResponseSchema, options, "PATCH");
    },
    seatCount({ gameId, ...body }: GameParams & SeatCountRequest, options: Options = {}) {
      return mutation({ gameId }, "seat-count", body, seatCountRequestSchema, lifecycleResponseSchema, options, "PATCH");
    },
    get(params: GameParams, options: Options = {}) {
      return send(gameUrl(params), getGameResponseSchema, { cache: "no-store", signal: options.signal });
    },
    submitAction({ gameId, ...body }: GameParams & SubmitActionRequest, options: Options = {}) {
      return mutation({ gameId }, "action", body, submitActionRequestSchema, submitActionResponseSchema, options);
    },
    stepBot({ gameId, ...body }: GameParams & StepBotRequest, options: Options = {}) {
      return mutation({ gameId }, "step", body, stepBotRequestSchema, stepBotResponseSchema, options);
    },
  },
};
