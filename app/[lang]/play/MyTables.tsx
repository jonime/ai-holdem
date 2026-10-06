"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { api } from "@/lib/http/api";
import type { MyGameSummary } from "@/lib/http/discovery-contracts";
import type { PlayDictionary } from "@/lib/i18n/types";
import type { Locale } from "@/lib/i18n";
import { FiChevronRight } from "react-icons/fi";
import styles from "./page.module.css";
export function MyTables({ locale, dictionary: d, initialGames, initialError }: {
  locale: Locale; dictionary: PlayDictionary; initialGames: readonly MyGameSummary[]; initialError: boolean;
}) {
  const [games, setGames] = useState(initialGames);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    try { setGames((await api.discovery.mine()).games); setError(false); }
    catch { setError(true); }
    finally { setBusy(false); }
  }, []);
  if (!games.length && !error && !busy) return null;
  return <section aria-labelledby="my-tables-heading" aria-busy={busy} className={styles.section}>
    <h2 id="my-tables-heading">{d.yourTables}</h2>
    {busy && <p role="status">{d.refreshing}</p>}
    {error && <div><p className={styles.warning} role="alert">{d.personalError}</p>
      <button className={styles.retryButton} type="button" disabled={busy} onClick={() => void refresh()}>{d.retry}</button></div>}
    <ul className={styles.list}>{games.map(game => {
      const title = game.title ?? d.fallbackTitle.replace("{id}", game.gameId.slice(0, 8));
      return <li key={game.gameId}>
        <Link className={`${styles.tableRow} ${styles.personalRow}`} href={`/${locale}/game/${game.gameId}`} aria-label={`${d.returnToTable}: ${title}`}>
          <h3 className={styles.rowTitle}>{title}</h3>
          <div className={styles.facts}><span>{d.statuses[game.status]}</span>
            <span>{d.seats.replace("{occupied}", String(game.occupiedSeats)).replace("{total}", String(game.totalSeats))}</span></div>
          <FiChevronRight className={styles.rowArrow} aria-hidden="true" />
        </Link>
      </li>;
    })}</ul>
  </section>;
}
