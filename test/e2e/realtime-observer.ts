import type { Page } from "@playwright/test";
import { RealtimeClient } from "@supabase/supabase-js";

export function observeRealtime(page: Page) {
  // Decode binary broadcasts from httpSend() with the installed SDK's protocol.
  // This decoder never connects; Playwright observes the browser's real socket.
  const decoder = new RealtimeClient("ws://localhost/realtime/v1", { params: { apikey: "decoder-only" } });
  let subscribed = false;
  const notifications: unknown[] = [];
  page.on("websocket", socket => {
    if (!socket.url().includes("/realtime/v1/websocket")) return;
    socket.on("framereceived", ({ payload }) => {
      try {
        const observe = (frame: { topic: string; event: string; payload: unknown }) => {
          const body = frame.payload;
          if (!body || typeof body !== "object") return;
          if (frame.topic?.startsWith("realtime:game:") && frame.event === "phx_reply" && "status" in body && body.status === "ok") subscribed = true;
          if (frame.event === "broadcast" && "payload" in body) notifications.push(body.payload);
        };
        if (typeof payload === "string") {
          const frame = JSON.parse(payload);
          observe(Array.isArray(frame) ? { topic: frame[2], event: frame[3], payload: frame[4] } : frame);
        } else {
          decoder.decode(Uint8Array.from(payload).buffer, observe);
        }
      } catch { /* Other frames do not represent game notifications. */ }
    });
  });
  return { notifications, subscribed: () => subscribed };
}

