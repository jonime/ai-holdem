import { NextResponse } from "next/server";

import { createDemoGame } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  try {
    const game = await createDemoGame(createSupabaseGameRepository());
    return NextResponse.json({ gameId: game.gameId }, { status: 201 });
  } catch (error) {
    console.error("Unable to create game", error);
    return NextResponse.json(
      { error: "Unable to create game" },
      { status: 500 },
    );
  }
}
