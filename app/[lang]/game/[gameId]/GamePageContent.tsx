import { notFound } from "next/navigation";

import { getHelpDocument } from "@/lib/help/server";

import PokerApp from "@/components/poker/PokerApp";
import { hasLocale } from "@/lib/i18n";
import { getPublicGame } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

interface GamePageContentProps {
  readonly params: Promise<{ lang: string; gameId: string }>;
}

export async function GamePageContent({ params }: GamePageContentProps) {
  const { lang, gameId } = await params;
  if (!hasLocale(lang)) notFound();

  try {
    await getPublicGame(createSupabaseGameRepository(), gameId);
  } catch (error) {
    if (error instanceof Error && error.name === "GameNotFoundError") {
      notFound();
      return null;
    }
    throw error;
  }

  const { default: HelpContent, title } = await getHelpDocument(lang);
  return <PokerApp gameId={gameId} helpContent={<HelpContent />} helpTitle={title} />;
}
