import { GamePageContent } from "@/app/[lang]/game/[gameId]/GamePageContent";
import { DEFAULT_LOCALE } from "@/lib/i18n";

export default async function EnglishGamePage({ params }: PageProps<"/game/[gameId]">) {
  const { gameId } = await params;
  return <GamePageContent params={Promise.resolve({ lang: DEFAULT_LOCALE, gameId })} />;
}
