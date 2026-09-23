import { GameHeader } from "@/components/poker/GameHeader";

export default function GameLayout({
  children,
}: LayoutProps<"/[lang]/game/[gameId]">) {
  return (
    <>
      <GameHeader />
      {children}
    </>
  );
}