import "server-only";

import { realtimeNotificationSchema, type RealtimeNotification } from "@/lib/http/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type GameEventType = Extract<RealtimeNotification, { version: number }>["type"];
export type SeatEventType = Exclude<RealtimeNotification["type"], GameEventType>;
export const REALTIME_SEND_TIMEOUT_MS = 5_000;

export type PublishGameEventResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: Error };

// Do not log exceptions: transport errors can contain credentials or response data.
export function logNotificationFailure(
  phase: "schedule" | "publish" | "cleanup",
  event: RealtimeNotification,
  startedAt: number,
): void {
  console.error("Realtime notification failed", {
    phase,
    type: event.type,
    gameId: event.gameId,
    ...("version" in event ? { version: event.version } : {}),
    elapsedMs: Math.max(0, Date.now() - startedAt),
  });
}

export async function publishNotification(input: RealtimeNotification): Promise<PublishGameEventResult> {
  const startedAt = Date.now();
  let event: RealtimeNotification | undefined;
  let client: ReturnType<typeof createSupabaseServerClient> | undefined;
  let channel: ReturnType<ReturnType<typeof createSupabaseServerClient>["channel"]> | undefined;
  try {
    event = realtimeNotificationSchema.parse(input);
    client = createSupabaseServerClient();
    channel = client.channel(`game:${event.gameId}`);
    const result = await channel.send({
      type: "broadcast",
      event: event.type,
      payload: event,
    }, { timeout: REALTIME_SEND_TIMEOUT_MS });
    if (result !== "ok") throw new Error("Realtime delivery failed");
    return { ok: true };
  } catch {
    // Invalid input is never logged; only validated notification fields are safe.
    if (event) logNotificationFailure("publish", event, startedAt);
    return { ok: false, error: new Error("Realtime delivery failed") };
  } finally {
    if (client && channel) {
      try {
        const result = await client.removeChannel(channel);
        if (result !== "ok" && event) logNotificationFailure("cleanup", event, startedAt);
      } catch {
        if (event) logNotificationFailure("cleanup", event, startedAt);
      }
    }
  }
}
