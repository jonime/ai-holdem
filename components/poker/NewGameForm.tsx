"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "@/components/poker/NewGameForm.module.css";
import type { LandingClientDictionary } from "@/lib/i18n/types";
import type { Locale } from "@/lib/i18n";

const gameStorageKey = "ai-holdem-game-id";
const playerNameStorageKey = "ai-holdem-player-name";

function initialPlayerName(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(playerNameStorageKey) ?? "";
}

export function NewGameForm({
  locale,
  messages,
}: {
  readonly locale: Locale;
  readonly messages: LandingClientDictionary["newGame"];
}) {
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
      throw new Error(body.error ?? messages.createGameError);
    }

    window.localStorage.setItem(gameStorageKey, body.gameId);
    router.push(`/${locale}/game/${body.gameId}`);
  }

  return (
    <>
      <label className={styles.playerNameField}>
        {messages.yourName}
        <input
          type="text"
          value={playerName}
          maxLength={30}
          placeholder={messages.anonymous}
          onChange={(event) => setPlayerName(event.target.value)}
        />
      </label>
      <button
        className={`${styles.newGame} ${styles.newGameHero}`}
        type="button"
        onClick={() => void createGame()}
      >
        {messages.newGame}
      </button>
    </>
  );
}
