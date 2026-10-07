import { z } from "zod";
import { NextResponse } from "next/server";
import { removeGameRequestSchema } from "@/lib/http/discovery-contracts";
import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import { removeTable, TableRemovalError } from "@/lib/poker/table-removal";
import { invalidatePublicDirectory } from "@/lib/poker/public-directory-cache";
import { scheduleSeatEvent } from "@/lib/realtime/schedule";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: { params: Promise<{ gameId: string }> }) {
  const path = z.object({ gameId: z.uuid() }).safeParse(await context.params);
  const body = removeGameRequestSchema.safeParse(await request.json().catch(() => null));
  if (!path.success || !body.success) return NextResponse.json({ error: "Invalid removal request" }, { status: 400, headers: privateHeaders });
  let playerToken: string | null;
  try { playerToken = getPlayerTokenFromRequest(request); } catch { playerToken = null; }
  if (!playerToken) return NextResponse.json({ error: "Player identity required" }, { status: 403, headers: privateHeaders });
  const { gameId } = path.data;
  try {
    const result = await removeTable(createSupabaseGameRepository(), { gameId, playerToken, ...body.data });
    invalidatePublicDirectory();
    // Seat signals always refetch, including deletion at the same version.
    scheduleSeatEvent(gameId, "seat_released");
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof TableRemovalError) {
      const status = { missing: 404, forbidden: 403, conflict: 409, blocked: 409 }[error.outcome];
      return NextResponse.json({ error: "Unable to remove table", code: error.outcome === "blocked" ? "TABLE_DELETION_BLOCKED" : error.outcome === "conflict" ? "GAME_CONFLICT" : "TABLE_REMOVAL_DENIED" }, { status, headers: privateHeaders });
    }
    if (error instanceof Error && error.name === "GameConflictError") return NextResponse.json({ error: "Game changed", code: "GAME_CONFLICT" }, { status: 409, headers: privateHeaders });
    console.error("Unable to remove table", { gameId });
    return NextResponse.json({ error: "Unable to remove table" }, { status: 500, headers: privateHeaders });
  }
}
