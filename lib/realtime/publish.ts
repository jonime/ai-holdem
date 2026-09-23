import "server-only";

import {
  getPublicGame,
  type PublicAIDecision,
  type PublicGame,
  type SeatAssignment,
} from "@/lib/poker/game-service";
import { realtimeGameEventSchema } from "@/lib/http/schemas";
import {
  createSupabaseGameRepository,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export type GameEventType =
  | "game_updated"
  | "player_action"
  | "ai_decision"
  | "hand_started"
  | "hand_completed"
  | "seat_claimed"
  | "seat_released"
  | "seat_bot_assigned"
  | "seat_count_updated"
  | "table_settings_updated";

export interface BroadcastGame {
  readonly id: string;
  readonly status: PublicGame["status"];
  readonly version: number;
  readonly poker: Omit<PublicGame["poker"], "legalActions" | "players"> & {
    readonly legalActions: readonly [];
    readonly players: readonly (Omit<
      PublicGame["poker"]["players"][number],
      "playerToken" | "holeCards"
    > & {
      readonly playerToken: null;
      readonly holeCards: null;
    })[];
  };
}

export function toBroadcastGame(game: PublicGame): BroadcastGame {
  return {
    ...game,
    poker: {
      ...game.poker,
      legalActions: [],
      players: game.poker.players.map((player) => ({
        ...player,
        playerToken: null,
        holeCards: null,
      })),
    },
  };
}

export interface GameEventPayload {
  readonly game?: BroadcastGame;
  readonly aiDecision?: PublicAIDecision;
  readonly seat?: BroadcastSeat;
}

export interface BroadcastSeat {
  readonly gameId: string;
  readonly seat: number;
  readonly name?: string;
  readonly status: SeatAssignment["status"];
  readonly controller: SeatAssignment["controller"];
  readonly aiDifficulty?: SeatAssignment["aiDifficulty"];
  readonly isHost: boolean;
  readonly leaving?: boolean;
  readonly playerToken: null;
}

export function toBroadcastSeat(assignment: SeatAssignment): BroadcastSeat {
  return {
    gameId: assignment.gameId,
    seat: assignment.seat,
    ...(assignment.name === undefined ? {} : { name: assignment.name }),
    status: assignment.status,
    controller: assignment.controller,
    ...(assignment.aiDifficulty === undefined
      ? {}
      : { aiDifficulty: assignment.aiDifficulty }),
    isHost: assignment.isHost,
    ...(assignment.leaving === undefined
      ? {}
      : { leaving: assignment.leaving }),
    playerToken: null,
  };
}

export type PublishGameEventResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: Error };

export async function publishGameEvent(
  gameId: string,
  type: GameEventType,
  version: number,
  payload: GameEventPayload,
): Promise<PublishGameEventResult> {
  let client: ReturnType<typeof createSupabaseServerClient> | null = null;
  let channel: ReturnType<
    ReturnType<typeof createSupabaseServerClient>["channel"]
  > | null = null;
  try {
    const event = realtimeGameEventSchema.parse({
      type,
      gameId,
      version,
      ...payload,
    });
    client = createSupabaseServerClient();
    channel = client.channel(`game:${gameId}`);
    const result = await channel.send({
      type: "broadcast",
      event: type,
      payload: event,
    });
    if (result !== "ok") {
      throw new Error(`Supabase Realtime returned ${result}`);
    }
    return { ok: true };
  } catch (error) {
    console.error(`Unable to publish ${type} for game ${gameId}`, error);
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  } finally {
    if (client && channel) {
      await client.removeChannel(channel).catch(() => undefined);
    }
  }
}

export async function publishSeatEvent(
  gameId: string,
  type: Extract<
    GameEventType,
    "seat_claimed" | "seat_released" | "seat_bot_assigned"
  >,
  assignment: SeatAssignment,
): Promise<PublishGameEventResult> {
  try {
    const game = await getPublicGame(
      createSupabaseGameRepository(),
      gameId,
      null,
    );
    return await publishGameEvent(gameId, type, game.version, {
      game: toBroadcastGame(game),
      seat: toBroadcastSeat(assignment),
    });
  } catch (error) {
    console.error(`Unable to prepare ${type} for game ${gameId}`, error);
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
