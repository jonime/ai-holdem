"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const gameStorageKey = "ai-holdem-game-id";
const playerNameStorageKey = "ai-holdem-player-name";

function initialPlayerName(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(playerNameStorageKey) ?? "";
}

export function NewGameForm() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState(initialPlayerName);

  async function createGame() {
    const trimmedName = playerName.trim();
    window.localStorage.setItem(playerNameStorageKey, trimmedName);

    const response = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(trimmedName ? { hostName: trimmedName } : {}),
      }),
    });
    const body = (await response.json()) as { gameId?: string; error?: string };

    if (!response.ok || !body.gameId) {
      throw new Error(body.error ?? "Unable to create game");
    }

    window.localStorage.setItem(gameStorageKey, body.gameId);
    router.push(`/game/${body.gameId}`);
  }

  return (
    <>
      <label className="player-name-field">
        Your name
        <input
          type="text"
          value={playerName}
          maxLength={30}
          placeholder="Anonymous"
          onChange={(event) => setPlayerName(event.target.value)}
        />
      </label>
      <button
        className="new-game new-game-hero"
        type="button"
        onClick={() => void createGame()}
      >
        New Game
      </button>
    </>
  );
}
