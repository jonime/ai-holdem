"use client";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api, HttpError } from "@/lib/http/api";
import type { MyGameSummary } from "@/lib/http/discovery-contracts";
import type { PlayDictionary } from "@/lib/i18n/types";
import { addLocalePrefix, type Locale } from "@/lib/i18n";
import { FiLogOut, FiTrash2 } from "react-icons/fi";
import { composition, createActivityClock, exactUpdate, personalTitle, relativeUpdate } from "./personal-summary";
import styles from "./page.module.css";
export function MyTables({ locale, dictionary: d, initialGames, initialError }: {
  locale: Locale; dictionary: PlayDictionary; initialGames: readonly MyGameSummary[]; initialError: boolean;
}) {
  const [games, setGames] = useState(initialGames);
  const clock = useMemo(() => createActivityClock(games), [games]);
  const now = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getServerSnapshot);
  const [error, setError] = useState(initialError);
  const pending = useRef(false);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    try { setGames((await api.discovery.mine()).games); setError(false); }
    catch { setError(true); }
    finally { setBusy(false); }
  }, []);
  async function remove(game: MyGameSummary, title: string) {
    if (pending.current || busy) return;
    const operation = game.removal === "deletion_blocked" ? "remove_from_list" : game.removal;
    if (!window.confirm((operation === "delete" ? d.confirmDelete : operation === "remove_from_list" ? d.confirmRemove : d.confirmLeave).replace("{title}", title))) return;
    pending.current = true;
    setBusy(true);
    setRemovalError(null);
    try {
      await api.discovery.remove({ gameId: game.gameId, expectedVersion: game.version, operation });
      setGames(current => current.filter(row => row.gameId !== game.gameId));
      try { setGames((await api.discovery.mine()).games); setError(false); }
      catch { setError(true); }
    } catch (failure) {
      if (failure instanceof HttpError && failure.status === 409) {
        try { setGames((await api.discovery.mine()).games); setError(false); }
        catch { setError(true); }
        setRemovalError(failure.code === "TABLE_DELETION_BLOCKED" ? d.deleteBlocked : d.removalConflict);
      } else setRemovalError(d.removalFailed);
    } finally { pending.current = false; setBusy(false); }
  }
  if (!games.length && !error && !busy && !removalError) return null;
  return <section aria-labelledby="my-tables-heading" aria-busy={busy} className={styles.section}>
    <h2 id="my-tables-heading">{d.yourTables}</h2>
    {removalError && <p role="alert" className={styles.warning}>{removalError}</p>}
    {busy && <p role="status">{d.refreshing}</p>}
    {error && <div><p className={styles.warning} role="alert">{d.personalError}</p>
      <button className={styles.retryButton} type="button" disabled={busy} onClick={() => void refresh()}>{d.retry}</button></div>}
    <ul className={styles.list}>{games.map(game => {
      const personalRemoval = game.removal === "remove_from_list" || game.removal === "deletion_blocked";
      const label = personalRemoval ? d.removeFromList : game.removal === "leave_and_remove" ? d.leaveAndRemove : d.deleteTable;
      const title = personalTitle(game, d);
      const discriminator = game.title === null ? ` · ${game.gameId.slice(0, 8)}` : "";
      const exact = d.updated.replace("{time}", exactUpdate(game.updatedAt, locale));
      return <li key={game.gameId} className={styles.personalItem}>
        <Link className={`${styles.tableRow} ${styles.personalRow}`} href={addLocalePrefix(`/game/${game.gameId}`, locale)} aria-label={`${d.returnToTable}: ${title}${discriminator}`}>
          <h3 className={styles.rowTitle}>{title}{game.title === null && <span className={styles.shortId}>{discriminator}</span>}</h3>
          <div className={styles.facts}><span>{d.statuses[game.status]}</span>
            <span>{d.seats.replace("{occupied}", String(game.occupiedSeats)).replace("{total}", String(game.totalSeats))}</span></div>
          <div className={`${styles.facts} ${styles.personalMetadata}`}>
            <span>{composition(game, locale, d)}</span>
            <time dateTime={game.updatedAt} title={exact} aria-label={exact}>{now === null ? exact : relativeUpdate(game.updatedAt, now, locale, d)}</time>
          </div>
        </Link>
          <button type="button" className={styles.removalButton} disabled={busy}
            title={label} aria-label={`${label}: ${title}${discriminator}`}
            onClick={() => void remove(game, `${title}${discriminator}`)}>{game.removal === "delete" ? <FiTrash2 aria-hidden="true" /> : <FiLogOut aria-hidden="true" />}</button>
      </li>;
    })}</ul>
  </section>;
}
