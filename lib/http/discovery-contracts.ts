import { z } from "zod";
import { publicDirectoryEnvelopeSchema, publicDirectoryEntrySchema } from "./schemas";
import { versionSchema, versionRequestSchema, type Immutable } from "./common-contracts";
export const directoryQuerySchema = z.object({ cursor: z.string().optional() });
export const directoryRouteQuerySchema = z.object({ cursor: z.string().nullable() });
export const directoryCursorSchema = z.object({ publishedAt: z.string(), gameId: z.string() });
export const directoryResponseSchema = publicDirectoryEnvelopeSchema;
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;
export type PublicGameDirectoryEntry = Immutable<z.infer<typeof publicDirectoryEntrySchema>>;
export type DirectoryResponse = Immutable<z.infer<typeof directoryResponseSchema>>;

export const joinRequestSchema = versionRequestSchema.extend({ name: z.string().optional() });
// Publication historically accepts any safe integer; the service/database owns conflicts.
export const publicationRequestSchema = z.object({ expectedVersion: z.number().int().safe(), isPublic: z.boolean(), title: z.string().nullable().optional() });
export const listingTitleSchema = z.string().refine(value => value.trim().length <= 60);
export const joinResponseSchema = z.object({ gameId: z.string(), seat: z.number().int().nonnegative(), version: versionSchema });
export const publicationResponseSchema = z.object({ version: versionSchema });
export const heartbeatResponseSchema = z.object({ renewed: z.literal(true) });
export type JoinRequest = z.infer<typeof joinRequestSchema>;
export type PublicationRequest = z.infer<typeof publicationRequestSchema>;
export type JoinResponse = z.infer<typeof joinResponseSchema>;
export type PublicationResponse = z.infer<typeof publicationResponseSchema>;
export type HeartbeatResponse = z.infer<typeof heartbeatResponseSchema>;

export const myGameSummarySchema = z.object({
  gameId: z.uuid(),
  title: z.string().min(1).max(60).nullable(),
  status: z.enum(["waiting", "playing", "complete", "error"]),
  updatedAt: z.iso.datetime({ offset: true }),
  occupiedSeats: z.number().int().min(0).max(6),
  totalSeats: z.number().int().min(2).max(6),
}).strict().refine(game => game.occupiedSeats <= game.totalSeats);
export const myGamesResponseSchema = z.object({ games: z.array(myGameSummarySchema).max(5) }).strict();
export type MyGameSummary = Immutable<z.infer<typeof myGameSummarySchema>>;
export type MyGamesResponse = Immutable<z.infer<typeof myGamesResponseSchema>>;
