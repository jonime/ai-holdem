import { GameHeader } from "@/components/poker/GameHeader";

export default function GameLayout({
  children,
}: LayoutProps<"/game/[gameId]">) {
  return (
    <>
      <GameHeader />
      {children}
    </>
  );
}
