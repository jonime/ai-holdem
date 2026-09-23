import "server-only";

import {
  getPublicGame,
  type PublicAIDecision,
  type PublicGame,
  type SeatAssignment,
} from "@/lib/poker/game-service";
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
  readonly seat?: Omit<SeatAssignment, "playerToken"> & {
    readonly playerToken: null;
  };
}

export async function publishGameEvent(
  gameId: string,
  type: GameEventType,
  version: number,
  payload: GameEventPayload,
): Promise<void> {
  let client: ReturnType<typeof createSupabaseServerClient> | null = null;
  let channel: ReturnType<
    ReturnType<typeof createSupabaseServerClient>["channel"]
  > | null = null;
  try {
    client = createSupabaseServerClient();
    channel = client.channel(`game:${gameId}`);
    const result = await channel.send({
      type: "broadcast",
      event: type,
      payload: { type, gameId, version, ...payload },
    });
    if (result !== "ok") {
      throw new Error(`Supabase Realtime returned ${result}`);
    }
  } catch (error) {
    console.error(`Unable to publish ${type} for game ${gameId}`, error);
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
): Promise<void> {
  try {
    const game = await getPublicGame(
      createSupabaseGameRepository(),
      gameId,
      null,
    );
    await publishGameEvent(gameId, type, game.version, {
      game: toBroadcastGame(game),
      seat: { ...assignment, playerToken: null },
    });
  } catch (error) {
    console.error(`Unable to prepare ${type} for game ${gameId}`, error);
  }
}
