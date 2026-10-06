"use client";

import { useSyncExternalStore } from "react";
import type { JoinGameDictionary } from "@/lib/i18n/types";
import styles from "./page.module.css";

const nameKey = "ai-holdem-player-name";
const nameChanged = "ai-holdem-player-name-changed";
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(nameChanged, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(nameChanged, onChange);
  };
}
function snapshot() { return window.localStorage.getItem(nameKey) ?? ""; }
function serverSnapshot() { return ""; }
export function usePlayerName() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
export function PlayerName({ dictionary }: { dictionary: JoinGameDictionary }) {
  const name = usePlayerName();
  return <label className={styles.nameField}>{dictionary.playerName}
    <input maxLength={30} autoComplete="nickname" value={name} placeholder={dictionary.namePlaceholder} onChange={event => {
      window.localStorage.setItem(nameKey, event.target.value);
      window.dispatchEvent(new Event(nameChanged));
    }} />
  </label>;
}
