import "server-only";

import { after } from "next/server";
import { realtimeNotificationSchema, type RealtimeNotification } from "@/lib/http/schemas";
import { logNotificationFailure, publishNotification, type GameEventType, type SeatEventType } from "./publish";

export function scheduleNotification(input: RealtimeNotification): void {
  const startedAt = Date.now();
  const parsed = realtimeNotificationSchema.safeParse(input);
  if (!parsed.success) return;
  const event = parsed.data;
  try {
    after(async () => {
      try {
        await publishNotification(event);
      } catch {
        logNotificationFailure("publish", event, startedAt);
      }
    });
  } catch {
    logNotificationFailure("schedule", event, startedAt);
  }
}

export function scheduleGameEvent(gameId: string, type: GameEventType, version: number): void {
  scheduleNotification({ type, gameId, version });
}

export function scheduleSeatEvent(gameId: string, type: SeatEventType): void {
  scheduleNotification({ type, gameId });
}
