import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

export async function POST(request: Request, context: { readonly params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  try {
    const renewed = await createSupabaseGameRepository().renewGameListingLease(gameId, getOrCreatePlayerToken(request));
    return renewed
      ? NextResponse.json({ renewed: true })
      : NextResponse.json({ error: "Listing is not renewable", code: "LISTING_NOT_RENEWABLE" }, { status: 409 });
  } catch (error) {
    console.error("Unable to renew listing", error);
    return NextResponse.json({ error: "Unable to renew listing" }, { status: 500 });
  }
}
