import { GamePageContent } from "./GamePageContent";

export default function GamePage({ params }: PageProps<"/[lang]/game/[gameId]">) {
  return <GamePageContent params={params} />;
}
