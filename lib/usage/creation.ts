import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UsageUnavailableError } from "./errors";
import { admitCreation } from "./admission";
export async function admitGameCreation(request: Request, hostToken: string): Promise<void> {
  let client;
  try { client = createSupabaseServerClient(); } catch { throw new UsageUnavailableError(); }
  await admitCreation(client, request, hostToken);
}
