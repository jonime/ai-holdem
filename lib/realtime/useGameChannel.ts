"use client";

import { useEffect, useRef } from "react";

import { createSupabaseBrowserClient } from "./client";

interface GameEventEnvelope {
  readonly type?: string;
  readonly version?: unknown;
}

function isFiniteSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isSafeInteger(value)
  );
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
            const eventType = event.type;
            const isSeatEvent =
              eventType === "seat_claimed" ||
              eventType === "seat_released" ||
              eventType === "seat_bot_assigned";
            if (!isSeatEvent && !eventType) {
              return;
            }
            if (!isSeatEvent && !isFiniteSafeInteger(event.version)) {
              return;
            }
            if (!isSeatEvent) {
              const version = event.version;
              if (!isFiniteSafeInteger(version)) {
                return;
              }
              if (
                versionRef.current !== null &&
                version <= versionRef.current
              ) {
                return;
              }
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
