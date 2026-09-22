"use client";

import { useRouter } from "next/navigation";

import { AppHeader } from "@/components/poker/AppHeader";

const gameStorageKey = "ai-holdem-game-id";

export default function Home() {
  const router = useRouter();

  async function createGame() {
    const response = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = (await response.json()) as { gameId?: string; error?: string };

    if (!response.ok || !body.gameId) {
      throw new Error(body.error ?? "Unable to create game");
    }

    window.localStorage.setItem(gameStorageKey, body.gameId);
    router.push(`/game/${body.gameId}`);
  }

  return (
    <main className="poker-app">
      <AppHeader onNewGame={() => void createGame()} />
      <section
        className="empty-state home-empty-state"
        aria-label="Start a new game"
      >
        <span className="empty-state-mark" aria-hidden="true">
          ♠
        </span>
        <h2>Deal yourself in</h2>
        <p>Create a table, then invite someone to take an open seat.</p>
        <button
          className="new-game new-game-hero"
          type="button"
          onClick={() => void createGame()}
        >
          New Game
        </button>
      </section>
    </main>
  );
}
