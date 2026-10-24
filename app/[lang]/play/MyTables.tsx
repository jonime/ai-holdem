"use client";
import Link from "next/link";
import { ConfirmationDialog } from "@/components/poker/ConfirmationDialog";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { GameErrorDetails } from "@/components/CopyErrorDetails";
import { captureDiagnostic, recoveryDiagnostics, type DiagnosticReport } from "@/lib/http/diagnostics";
import { api, HttpError, unknownOutcome } from "@/lib/http/api";
import type { MyGameSummary } from "@/lib/http/discovery-contracts";
import type { PlayDictionary } from "@/lib/i18n/types";
import { addLocalePrefix, type Locale } from "@/lib/i18n";
import { FiLogOut, FiTrash2 } from "react-icons/fi";
import { composition, createActivityClock, exactUpdate, personalTitle, relativeUpdate } from "./personal-summary";
import styles from "./page.module.css";
export function MyTables({ locale, dictionary: d, initialGames, initialError }: {
  locale: Locale; dictionary: PlayDictionary; initialGames: readonly MyGameSummary[]; initialError: boolean;
}) {
  const [listDiagnostics, setListDiagnostics] = useState<DiagnosticReport>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticReport>([]);
  const [games, setGames] = useState(initialGames);
  const clock = useMemo(() => createActivityClock(games), [games]);
  const now = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getServerSnapshot);
  const [error, setError] = useState(initialError);
  const pending = useRef(false);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<{ gameId: string; operation: "delete" | "remove_from_list" | "leave_and_remove"; title: string } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [operationChanged, setOperationChanged] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const fallback = useRef<HTMLElement | null>(null);
  const lifecycle = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const lifetime = lifecycle;
    ++lifetime.current;
    const abort = new AbortController();
    controller.current = abort;
    fallback.current = document.getElementById("play-heading");
    return () => { ++lifetime.current; abort.abort(); };
  }, []);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    const generation = lifecycle.current;
    try {
      const rows = (await api.discovery.mine({ signal: controller.current?.signal })).games;
      if (generation !== lifecycle.current) return;
      setGames(rows); setError(false); setListDiagnostics([]); setDiagnostics([]); setBlocked(false);
      if (selection) {
        const row = rows.find(game => game.gameId === selection.gameId);
        setRemovalError(row ? d.removalUncertain : d.noLongerListed);
        if (row && (row.removal === "deletion_blocked" ? "remove_from_list" : row.removal) !== selection.operation) setOperationChanged(true);
      }
    } catch (failure) { if (generation === lifecycle.current) { setError(true); setListDiagnostics(captureDiagnostic(failure)); } }
    finally { if (generation === lifecycle.current) { pending.current = false; setBusy(false); } }
  }, [selection, d]);
  const selected = games.find(game => game.gameId === selection?.gameId);
  const operation = (game: MyGameSummary) => game.removal === "deletion_blocked" ? "remove_from_list" : game.removal;
  const changed = operationChanged || (!!selected && !!selection && operation(selected) !== selection.operation);
  async function remove() {
    if (!selection || !selected || pending.current || busy || blocked || changed) return;
    pending.current = true; setBusy(true); setRemovalError(null); setDiagnostics([]);
    const generation = lifecycle.current;
    const current = () => generation === lifecycle.current;
    const reconcile = async (original: DiagnosticReport = []) => {
      try {
        const rows = (await api.discovery.mine({ signal: controller.current?.signal })).games;
        if (!current()) return;
        setGames(rows); setError(false); setListDiagnostics([]); setDiagnostics([]); setBlocked(false);
        const row = rows.find(game => game.gameId === selection.gameId);
        if (!row) setRemovalError(d.noLongerListed);
        else if (operation(row) !== selection.operation) setOperationChanged(true);
      } catch (recoveryError) { if (current()) { setBlocked(true); setRemovalError(d.removalRecoveryFailed); setDiagnostics(recoveryDiagnostics(original, recoveryError)); } }
    };
    try {
      await api.discovery.remove({ gameId: selected.gameId, expectedVersion: selected.version, operation: selection.operation }, { signal: controller.current?.signal });
      if (!current()) return;
      setSelection(null);
      setGames(rows => rows.filter(row => row.gameId !== selected.gameId));
      // An acknowledged removal stays successful even if refilling the list fails.
      try {
        const rows = (await api.discovery.mine({ signal: controller.current?.signal })).games;
        if (current()) { setGames(rows); setError(false); setListDiagnostics([]); }
      } catch (failure) { if (current()) { setError(true); setListDiagnostics(captureDiagnostic(failure)); } }
    } catch (failure) {
      if (!current()) return;
      if (failure instanceof HttpError && failure.status === 409) {
        setRemovalError(d.removalConflict); await reconcile();
      } else if (unknownOutcome(failure)) {
        setRemovalError(d.removalUncertain); await reconcile(captureDiagnostic(failure));
      } else { setRemovalError(d.removalFailed); setDiagnostics(captureDiagnostic(failure)); }
    } finally { if (current()) { pending.current = false; setBusy(false); } }
  }
  return <>
    {busy && !selection && <span className={styles.srOnly} role="status">{d.refreshing}</span>}
    <div aria-busy={busy && !selection}>
      {!games.length && !error && <p className={styles.empty}>{d.emptyPersonal} <Link prefetch={false} href={addLocalePrefix("/play?tab=public", locale)}>{d.publicTables}</Link></p>}

      {error && !selection && <div><p className={styles.warning} role="alert">{d.personalError}</p><GameErrorDetails report={listDiagnostics} />
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
              onClick={event => {
                opener.current = event.currentTarget; if (!blocked) setRemovalError(null); setOperationChanged(false);
                setSelection({ gameId: game.gameId, operation: operation(game), title: `${title}${discriminator}` });
              }}>{game.removal === "delete" ? <FiTrash2 aria-hidden="true" /> : <FiLogOut aria-hidden="true" />}</button>
        </li>;
      })}</ul>
      {selection ? <ConfirmationDialog title={selection.operation === "delete" ? d.deleteTable : selection.operation === "remove_from_list" ? d.removeFromList : d.leaveAndRemove}
        explanation={(selection.operation === "delete" ? d.confirmDelete : selection.operation === "remove_from_list" ? d.confirmRemove : d.confirmLeave).replace("{title}", selection.title)}
        cancelLabel={d.cancel} confirmLabel={selection.operation === "delete" ? d.deleteTable : selection.operation === "remove_from_list" ? d.removeFromList : d.leaveAndRemove}
        pendingLabel={d.removing} feedback={changed ? d.removalOperationChanged : removalError}
        blocked={busy || blocked || changed || !selected} onConfirm={remove} onClose={() => { if (!pending.current) { setSelection(null); setDiagnostics([]); } }} restoreFocus={opener} fallbackFocus={fallback}>
        {removalError && !changed ? <GameErrorDetails report={diagnostics} /> : null}
        {blocked ? <button className={styles.retryButton} disabled={busy} onClick={() => void refresh()}>{d.refreshList}</button> : null}
      </ConfirmationDialog> : null}
  </div></>;
}
