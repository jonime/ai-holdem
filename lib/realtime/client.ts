"use client";

// Use the existing lockfile-installed Realtime transport directly: the umbrella
// SDK imports Auth, whose module-level debug read can throw before React mounts.
import { RealtimeClient } from "@supabase/realtime-js";

let client: RealtimeClient | null = null;

export function createSupabaseBrowserClient(): RealtimeClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  const endpoint = new URL("realtime/v1", url.endsWith("/") ? url : `${url}/`);
  endpoint.protocol = endpoint.protocol.replace("http", "ws");
  client = new RealtimeClient(endpoint.href, {
    params: { apikey: key },
    accessToken: async () => key,
  });
  return client;
}
