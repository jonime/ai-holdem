import { NextResponse } from "next/server";
import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import { listMyGames } from "@/lib/poker/my-games";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const token = getPlayerTokenFromRequest(request);
    const body = token ? await listMyGames(createSupabaseGameRepository(), token) : { games: [] };
    return NextResponse.json(body, { headers });
  } catch {
    // Personal lists and repository failures must never enter logs.
    return NextResponse.json({ error: "Unable to load your tables" }, { status: 500, headers });
  }
}
