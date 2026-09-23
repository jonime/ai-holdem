"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";

import { APP_NAME } from "@/lib/constants";

const gameStorageKey = "ai-holdem-game-id";
const playerNameStorageKey = "ai-holdem-player-name";

function initialPlayerName(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(playerNameStorageKey) ?? "";
}

export default function Home() {
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
    <main className="poker-app">
      <section
        className="empty-state home-empty-state"
        aria-label="Start a new game"
      >
        <Image
          className="empty-state-mark"
          src="/ai-holdem-logo.png"
          alt="AI Hold'em"
          width={270}
          height={270}
          sizes="(max-width: 450px) 60vw, 270px"
          priority
        />
        <h1>{APP_NAME}</h1>
        <p>Create a table, then invite someone to take an open seat.</p>
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
      </section>
      <section className="home-attribution" aria-label="About the bots">
        <p>
          The bots at this table use{" "}
          <a href="https://typesafe.ai/" target="_blank" rel="noreferrer">
            TypeSafe
          </a>{" "}
          for their poker decisions. View the source on{" "}
          <a
            href="https://github.com/jonime/ai-holdem"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          .
        </p>
      </section>
    </main>
  );
}
