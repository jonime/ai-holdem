"use client";

import { useEffect, useRef, useState } from "react";

import { realtimeGameEventSchema } from "@/lib/http/schemas";
import { createSupabaseBrowserClient } from "./client";

export type GameChannelStatus =
  | "connecting"
  | "subscribed"
  | "error"
  | "closed";

export function shouldRefreshForGameEvent(
  event: ReturnType<typeof realtimeGameEventSchema.parse>,
  gameId: string,
  currentVersion: number | null,
): boolean {
  if (event.gameId !== gameId) return false;
  const isSeatEvent =
    event.type === "seat_claimed" ||
    event.type === "seat_released" ||
    event.type === "seat_bot_assigned";
  return (
    isSeatEvent || currentVersion === null || event.version > currentVersion
  );
}

export function useGameChannel(
  gameId: string | undefined,
  currentVersion: number | null,
  onUpdate: () => void,
): GameChannelStatus {
  const versionRef = useRef(currentVersion);
  const onUpdateRef = useRef(onUpdate);
  const [status, setStatus] = useState<GameChannelStatus>(() =>
    gameId ? "connecting" : "closed",
  );

  useEffect(() => {
    versionRef.current = currentVersion;
  }, [currentVersion]);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!gameId) {
      return;
    }

    let active = true;
    queueMicrotask(() => {
      if (active) setStatus("connecting");
    });
    let client: ReturnType<typeof createSupabaseBrowserClient>;
    let channel: ReturnType<
      ReturnType<typeof createSupabaseBrowserClient>["channel"]
    >;
    try {
      client = createSupabaseBrowserClient();
      channel = client
        .channel(`game:${gameId}`)
        .on(
          "broadcast",
          { event: "*" },
          ({ payload }: { payload: unknown }) => {
            const parsed = realtimeGameEventSchema.safeParse(payload);
            if (
              !parsed.success ||
              !shouldRefreshForGameEvent(
                parsed.data,
                gameId,
                versionRef.current,
              )
            )
              return;
            onUpdateRef.current();
          },
        );
      void channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setStatus("subscribed");
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setStatus("error");
          console.error(`Realtime channel ${gameId} is unavailable`);
          return;
        }
        if (status === "CLOSED") {
          setStatus("closed");
          console.error(`Realtime channel ${gameId} closed`);
        }
      });
    } catch (error) {
      queueMicrotask(() => {
        if (active) setStatus("error");
      });
      console.error("Unable to connect to game Realtime channel", error);
      return;
    }

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [gameId]);

  return gameId ? status : "closed";
}
