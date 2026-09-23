import { notFound } from "next/navigation";

import PokerApp from "@/components/poker/PokerApp";
import { getPublicGame } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

interface GamePageContentProps {
  readonly params: Promise<{ gameId: string }>;
}

export async function GamePageContent({ params }: GamePageContentProps) {
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
