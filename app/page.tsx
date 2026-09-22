"use client";

import { useRouter } from "next/navigation";

const gameStorageKey = "ai-holdem-game-id";

export default function Home() {
  const router = useRouter();

  async function createGame() {
    const response = await fetch("/api/games", { method: "POST" });
    const body = (await response.json()) as { gameId?: string; error?: string };

    if (!response.ok || !body.gameId) {
      throw new Error(body.error ?? "Unable to create game");
    }

    window.localStorage.setItem(gameStorageKey, body.gameId);
    router.push(`/game/${body.gameId}`);
  }

  return (
    <main className="poker-app">
      <header className="app-header">
        <div>
          <h1>AI Hold&apos;em</h1>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => void createGame()}>
            New Game
          </button>
        </div>
      </header>
      <section className="empty-state">
        <p>
          Start a fresh heads-up table and share the URL with a second browser.
        </p>
      </section>
    </main>
  );
}
