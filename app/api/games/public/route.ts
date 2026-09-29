import { NextResponse } from "next/server";

import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import { listPublicGames } from "@/lib/poker/directory";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

function decodeCursor(value: string | null) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      parsed && typeof parsed === "object" &&
      typeof (parsed as Record<string, unknown>).publishedAt === "string" &&
      typeof (parsed as Record<string, unknown>).gameId === "string"
    ) return parsed as { publishedAt: string; gameId: string };
  } catch {}
  return null;
}

export async function GET(request: Request) {
  const cursorValue = new URL(request.url).searchParams.get("cursor");
  const cursor = decodeCursor(cursorValue);
  if (cursorValue && !cursor) {
    return NextResponse.json({ error: "Invalid directory cursor" }, { status: 400 });
  }
  try {
    const games = await listPublicGames(
      createSupabaseGameRepository(),
      getPlayerTokenFromRequest(request),
      cursor,
    );
    const last = games.at(-1);
    const nextCursor = games.length === 50 && last
      ? Buffer.from(JSON.stringify({ publishedAt: last.publishedAt, gameId: last.gameId })).toString("base64url")
      : null;
    return NextResponse.json(
      { games, nextCursor },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Unable to list public games", error);
    return NextResponse.json({ error: "Unable to load public games" }, { status: 500 });
  }
}
