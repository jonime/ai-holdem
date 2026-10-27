import { publicSharedReplaySchema, activeShareSchema, editShareTitleSchema, createReplayShareSchema } from "./share-contracts";
import type { Locale } from "@/lib/i18n";
import { shareListSchema, shareListQuerySchema, type ShareListQuery, shareTokenSchema, shareManagementSchema, revokeShareSchema } from "./share-contracts";
import { resultsParamsSchema, resultsResponseSchema } from "./results-contracts";
import { replayParamsSchema, replayResponseSchema } from "./replay-contracts";
import { TransportError, withDeadline } from "./deadline";
export { TransportError, unknownOutcome } from "./deadline";
import { addLocalePrefix } from "@/lib/i18n";
import { z } from "zod";
import { errorEnvelopeSchema, type GameParams, type VersionRequest } from "./common-contracts";
import {
  advanceTimeoutRequestSchema, advanceTimeoutResponseSchema, type AdvanceTimeoutRequest,
  advanceDepartureRequestSchema, advanceDepartureResponseSchema, gameParamsSchema, getGameResponseSchema, submitActionRequestSchema,
  submitActionResponseSchema, stepBotRequestSchema, stepBotResponseSchema,
  startRequestSchema, nextHandRequestSchema, revealRequestSchema,
  settingsRequestSchema, seatCountRequestSchema, lifecycleResponseSchema,
  type AdvanceDepartureRequest, type SubmitActionRequest, type StepBotRequest, type RevealRequest,
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
  removeGameRequestSchema, removeGameResponseSchema, type RemoveGameRequest,
  myGamesResponseSchema, directoryQuerySchema, directoryResponseSchema, joinRequestSchema,
  publicationRequestSchema, joinResponseSchema, publicationResponseSchema,
  heartbeatResponseSchema, type DirectoryQuery, type JoinRequest, type PublicationRequest,
} from "./discovery-contracts";

import { HttpError } from "./http-error";
export { HttpError } from "./http-error";
import { instrumentApi } from "./diagnostics";

type Options = { readonly signal?: AbortSignal };
function gameUrl(params: GameParams) {
  return `/api/games/${encodeURIComponent(gameParamsSchema.parse(params).gameId)}`;
}
async function send<S extends z.ZodType>(url: string, schema: S, init: RequestInit): Promise<z.output<S>> {
  let response: Response;
  try { response = await fetch(url, { ...init, credentials: "same-origin" }); }
  catch {
    if (init.signal?.aborted) { init.signal.throwIfAborted(); }
    throw new TransportError("network", "Network failure");
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (init.signal?.aborted) {
      init.signal.throwIfAborted();
      throw error;
    }
    if (response.ok) throw new TransportError(error instanceof TypeError ? "network" : "invalidResponse", error instanceof TypeError ? "Response body disconnected" : "Invalid response payload", response.status);
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
      failure.success ? failure.data.requestReference : undefined,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new TransportError("invalidResponse", "Invalid response payload", response.status);
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
  const scoped = ["action", "settings", "seat-count", "start", "next-hand", "reveal", "advance-timeout", "advance-departure", "step"].includes(suffix) || suffix.startsWith("seats/");
  const request = (signal?: AbortSignal) => send(`${gameUrl(params)}/${suffix}`, response, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(schema.parse(body)),
    signal,
  });
  return scoped ? withDeadline(request, suffix === "step" ? 100_000 : 15_000, options.signal) : request(options.signal);
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

function shareManagement(params: { gameId: string; handNumber: number }, method: "GET" | "POST" | "DELETE", options: Options, locale?: Locale) {
  const { gameId, handNumber } = replayParamsSchema.parse(params);
  return withDeadline(signal => send(`${gameUrl({ gameId })}/hands/${handNumber}/share`, shareManagementSchema,
    { method, cache: "no-store", signal, ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(createReplayShareSchema.parse({ locale })) } : {}) }), 15_000, options.signal);
}
export const api = instrumentApi({
  shares: {
    editTitle(token: string, body: z.infer<typeof editShareTitleSchema>, options: Options = {}) {
      return withDeadline(signal => send(`/api/replays/owned/${shareTokenSchema.parse(token)}`, activeShareSchema, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editShareTitleSchema.parse(body)), signal }), 15_000, options.signal);
    },
    list(query: ShareListQuery = {}, options: Options = {}) {
      return withDeadline(signal => send(`/api/replays/owned${queryString(shareListQuerySchema.parse(query))}`, shareListSchema, { cache: "no-store", signal }), 15_000, options.signal);
    },
    revokeOwned(token: string, options: Options = {}) {
      return withDeadline(signal => send(`/api/replays/owned/${shareTokenSchema.parse(token)}`, revokeShareSchema, { method: "DELETE", cache: "no-store", signal }), 15_000, options.signal);
    },
    active(params: { gameId: string; handNumber: number }, options: Options = {}) { return shareManagement(params, "GET", options); },
    create(params: { gameId: string; handNumber: number; locale?: Locale }, options: Options = {}) { const { locale, ...path } = params; return shareManagement(path, "POST", options, locale); },
    revoke(params: { gameId: string; handNumber: number }, options: Options = {}) {
      const { gameId, handNumber } = replayParamsSchema.parse(params);
      return withDeadline(signal => send(`${gameUrl({ gameId })}/hands/${handNumber}/share`, revokeShareSchema, { method: "DELETE", cache: "no-store", signal }), 15_000, options.signal);
    },
    read(token: string, options: Options = {}) {
      return withDeadline(signal => send(`/api/replays/${shareTokenSchema.parse(token)}`, publicSharedReplaySchema, { cache: "no-store", signal }), 15_000, options.signal);
    },
  },
  bots: {
    catalog(options: Options = {}) {
      return send("/api/bots", botCatalogResponseSchema, { cache: "no-store", signal: options.signal });
    },
  },
  discovery: {
    remove({ gameId, ...body }: GameParams & RemoveGameRequest, options: Options = {}) {
      return mutation({ gameId }, "remove", body, removeGameRequestSchema, removeGameResponseSchema, options);
    },
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
      return send(addLocalePrefix(`/quick-game${queryString({ botMode: parsed.botMode })}`, parsed.lang), quickPlayResponseSchema, { method: "POST", headers: { Accept: "application/json", ...(parsed.creationAttemptId ? { "Content-Type": "application/json" } : {}) }, ...(parsed.creationAttemptId ? { body: JSON.stringify({ creationAttemptId: parsed.creationAttemptId, hostName: parsed.hostName }) } : {}), signal: options.signal });
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
    results(params: GameParams, options: Options = {}) {
      return withDeadline(signal => send(`${gameUrl(resultsParamsSchema.parse(params))}/results`, resultsResponseSchema,
        { cache: "no-store", signal }), 15_000, options.signal);
    },
    replay(params: { gameId: string; handNumber: number }, options: Options = {}) {
      const { gameId, handNumber } = replayParamsSchema.parse(params);
      return withDeadline(signal => send(`${gameUrl({ gameId })}/hands/${handNumber}/replay`, replayResponseSchema.refine(({ replay }) => replay.gameId === gameId && replay.handNumber === handNumber), { cache: "no-store", signal }), 15_000, options.signal);
    },
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
    advanceTimeout({ gameId, ...body }: GameParams & AdvanceTimeoutRequest, options: Options = {}) {
      return mutation({ gameId }, "advance-timeout", body, advanceTimeoutRequestSchema, advanceTimeoutResponseSchema, options);
    },
    advanceDeparture({ gameId, ...body }: GameParams & AdvanceDepartureRequest, options: Options = {}) {
      return mutation({ gameId }, "advance-departure", body, advanceDepartureRequestSchema, advanceDepartureResponseSchema, options);
    },
    stepBot({ gameId, ...body }: GameParams & StepBotRequest, options: Options = {}) {
      return mutation({ gameId }, "step", body, stepBotRequestSchema, stepBotResponseSchema, options);
    },
  },
});
