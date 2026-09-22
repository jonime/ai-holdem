import { notFound } from "next/navigation";

import PokerApp from "@/components/poker/PokerApp";
import { getPublicGame } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

interface GamePageParams {
  readonly params: Promise<{ gameId: string }>;
}

export default async function GamePage({ params }: GamePageParams) {
  const { gameId } = await params;

  try {
    await getPublicGame(createSupabaseGameRepository(), gameId);
  } catch (error) {
    if (error instanceof Error && error.name === "GameNotFoundError") {
      notFound();
      return null;
    }
    throw error;
  }

  return <PokerApp gameId={gameId} />;
}
