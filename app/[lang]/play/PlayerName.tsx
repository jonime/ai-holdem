"use client";

import { savePlayerName, usePlayerName } from "@/lib/browser/player-name";
export { usePlayerName } from "@/lib/browser/player-name";
import type { JoinGameDictionary } from "@/lib/i18n/types";
import styles from "./page.module.css";

export function PlayerName({ dictionary }: { dictionary: JoinGameDictionary }) {
  const name = usePlayerName();
  return <label className={styles.nameField}>{dictionary.playerName}
    <input name="hostName" maxLength={30} autoComplete="nickname" value={name} placeholder={dictionary.namePlaceholder} onChange={event => {
      savePlayerName(event.target.value);
    }} />
  </label>;
}
