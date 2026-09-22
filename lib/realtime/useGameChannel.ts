"use client";

import { useEffect, useRef } from "react";

import { createSupabaseBrowserClient } from "./client";

interface GameEventEnvelope {
  readonly type?: string;
  readonly version?: unknown;
}

export function useGameChannel(
  gameId: string | undefined,
  currentVersion: number | null,
  onUpdate: () => void,
): void {
  const versionRef = useRef(currentVersion);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    versionRef.current = currentVersion;
  }, [currentVersion]);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!gameId) return;

    let channel: ReturnType<
      ReturnType<typeof createSupabaseBrowserClient>["channel"]
    >;
    try {
      const client = createSupabaseBrowserClient();
      channel = client
        .channel(`game:${gameId}`)
        .on(
          "broadcast",
          { event: "*" },
          ({ payload }: { payload: unknown }) => {
            if (!payload || typeof payload !== "object") return;
            const event = payload as GameEventEnvelope;
            const isSeatEvent =
              event.type === "seat_claimed" ||
              event.type === "seat_released" ||
              event.type === "seat_bot_assigned";
            if (
              !isSeatEvent &&
              typeof event.version === "number" &&
              versionRef.current !== null &&
              event.version <= versionRef.current
            ) {
              return;
            }
            onUpdateRef.current();
          },
        );
      void channel.subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(`Realtime channel ${gameId} is unavailable`);
        }
      });
    } catch (error) {
      console.error("Unable to connect to game Realtime channel", error);
      return;
    }

    return () => {
      void createSupabaseBrowserClient().removeChannel(channel);
    };
  }, [gameId]);
}
