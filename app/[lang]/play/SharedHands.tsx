"use client";
import { useEffect, useRef, useState } from "react";
import { GameErrorDetails } from "@/components/CopyErrorDetails";
import { captureDiagnostic, recoveryDiagnostics, type DiagnosticReport } from "@/lib/http/diagnostics";
import { api, HttpError, unknownOutcome } from "@/lib/http/api";
import type { OwnedShare, ShareList } from "@/lib/http/share-contracts";
import { addLocalePrefix, type Locale } from "@/lib/i18n";
import type { PlayDictionary } from "@/lib/i18n/types";
import { useI18n } from "@/components/poker/I18nProvider";
import { ConfirmationDialog } from "@/components/poker/ConfirmationDialog";
import { useShareClipboard } from "@/components/poker/useShareClipboard";
import { exactUpdate } from "./personal-summary";
import { CollectionRefresh } from "./Collection";
import styles from "./page.module.css";

export function SharedHands({ locale, dictionary: d, initialPage, initialError, initialNow }: {
  locale: Locale; dictionary: PlayDictionary; initialPage: ShareList; initialError: boolean; initialNow: number;
}) {
  const { t } = useI18n();
  const [listDiagnostics, setListDiagnostics] = useState<DiagnosticReport>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticReport>([]);
  const [page, setPage] = useState(initialPage);
  const [now, setNow] = useState(initialNow);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selection, setSelection] = useState<OwnedShare | null>(null);
  const lock = useRef(false);
  const lifecycle = useRef<AbortController | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const fallback = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller;
    fallback.current = document.getElementById("shared-hands-heading");
    return () => controller.abort();
  }, []);
  // Wake only at the next expiry, rather than running a countdown or polling.
  useEffect(() => {
    const next = Math.min(...page.shares.map(row => Date.parse(row.expiresAt)).filter(expiry => expiry > now));
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2_147_483_647, Math.max(0, next - Date.now())));
    if (!Number.isFinite(next)) clearTimeout(timer);
    return () => clearTimeout(timer);
  }, [page.shares, now]);
  function handleAvailable(row: OwnedShare) {
    // Invoked only by row event handlers or the confirmation submission.
    // eslint-disable-next-line react-hooks/purity
    const current = Date.now();
    if (Date.parse(row.expiresAt) > current) return true;
    setNow(current); setSelection(null); return false;
  }
  async function load(more = false) {
    if (lock.current || more && (blocked || !page.nextCursor)) return;
    lock.current = true; setBusy(true);
    const signal = lifecycle.current!.signal;
    try {
      const result = await api.shares.list(more ? page.nextCursor! : {}, { signal });
      if (signal.aborted) return;
      setPage(previous => more ? { shares: [...previous.shares, ...result.shares.filter(row => !previous.shares.some(old => old.token === row.token))], nextCursor: result.nextCursor } : result);
      setNow(Date.now()); setError(false); setListDiagnostics([]); setBlocked(false); setSelection(null); setFeedback(null); setDiagnostics([]);
    } catch (failure) { if (!signal.aborted) { setError(true); setListDiagnostics(captureDiagnostic(failure)); } }
    finally { if (!signal.aborted) { lock.current = false; setBusy(false); } }
  }
  async function handleRevoke() {
    if (!selection || lock.current || blocked || !handleAvailable(selection)) return;
    lock.current = true; setBusy(true); setFeedback(null); setDiagnostics([]);
    const signal = lifecycle.current!.signal;
    try {
      await api.shares.revokeOwned(selection.token, { signal });
      if (signal.aborted) return;
      setSelection(null);
      setPage(previous => ({ ...previous, shares: previous.shares.filter(row => row.token !== selection.token) }));
      // Refill failures are list failures; the acknowledged revocation stays successful.
      try {
        const result = await api.shares.list({}, { signal });
        // Event-driven reconciliation after an awaited mutation.
        // eslint-disable-next-line react-hooks/purity
        if (!signal.aborted) { setPage(result); setNow(Date.now()); setError(false); setListDiagnostics([]); }
      } catch (failure) { if (!signal.aborted) { setError(true); setListDiagnostics(captureDiagnostic(failure)); } }
    } catch (failure) {
      if (signal.aborted) return;
      if (unknownOutcome(failure) || failure instanceof HttpError && failure.status >= 500) {
        try {
          const result = await api.shares.list({}, { signal });
          // Event-driven reconciliation after an awaited mutation.
          // eslint-disable-next-line react-hooks/purity
          if (!signal.aborted) { setPage(result); setNow(Date.now()); setError(false); setListDiagnostics([]); setSelection(null); setFeedback(d.shareUncertain); setDiagnostics([]); }
        } catch (recoveryError) { if (!signal.aborted) { setBlocked(true); setFeedback(d.shareRecoveryFailed); setDiagnostics(recoveryDiagnostics(captureDiagnostic(failure), recoveryError)); } }
      } else { setFeedback(t("sharing.error")); setDiagnostics(captureDiagnostic(failure)); }
    } finally { if (!signal.aborted) { lock.current = false; setBusy(false); } }
  }
  const rows = page.shares.filter(row => Date.parse(row.expiresAt) > now);
  return <>
    {busy && !selection ? <span className={styles.srOnly} role="status">{d.refreshing}</span> : null}
    <div aria-busy={busy}>
      <CollectionRefresh label={`${d.refreshList}: ${d.sharedHands}`} busy={busy && !selection} disabled={busy} onClick={() => void load()} />
      {error ? <p role="alert" className={styles.warning}>{d.sharedError}</p> : null}
      {error ? <GameErrorDetails report={listDiagnostics} /> : null}
      {feedback && !selection ? <p role="status">{feedback}</p> : null}
      {!rows.length && !error ? <p className={styles.empty}>{d.emptyShares}</p> : null}
      <ul className={styles.list}>{rows.map(row => <ShareRow key={row.token} row={row} locale={locale} dictionary={d}
        disabled={busy || blocked} onAvailable={() => handleAvailable(row)} onRevoke={element => { opener.current = element; setSelection(row); setFeedback(null); setDiagnostics([]); }} />)}</ul>
      {page.nextCursor ? <button className={styles.loadMore} disabled={busy || blocked} onClick={() => void load(true)}>{d.loadMore}</button> : null}
      {selection ? <ConfirmationDialog title={`${t("sharing.revoke")} · ${selection.token.slice(0, 8)}`}
        explanation={t("sharing.revokeNotice")} cancelLabel={d.cancel} confirmLabel={t("sharing.confirmRevoke")}
        pendingLabel={t("sharing.pending")} feedback={feedback} blocked={busy || blocked || Date.parse(selection.expiresAt) <= now}
        onConfirm={handleRevoke} onClose={() => { if (!lock.current) { setSelection(null); setDiagnostics([]); } }} restoreFocus={opener} fallbackFocus={fallback}>
        {feedback ? <GameErrorDetails report={diagnostics} /> : null}
        {blocked ? <button className={styles.retryButton} disabled={busy} onClick={() => void load()}>{d.refreshList}</button> : null}
      </ConfirmationDialog> : null}
  </div></>;
}
function ShareRow({ row, locale, dictionary: d, disabled, onAvailable, onRevoke }: {
  row: OwnedShare; locale: Locale; dictionary: PlayDictionary; disabled: boolean; onAvailable: () => boolean; onRevoke: (element: HTMLElement) => void;
}) {
  const { t } = useI18n();
  const clipboard = useShareClipboard();
  const path = addLocalePrefix(`/replay/${row.token}`, locale);
  const title = d.shareHand.replace("{hand}", String(row.handNumber)).replace("{id}", row.token.slice(0, 8));
  return <li className={styles.shareItem}>
    <h3 className={styles.rowTitle}>{title}</h3>
    <div className={styles.facts}>
      <time dateTime={row.createdAt}>{d.shareCreated.replace("{date}", exactUpdate(row.createdAt, locale))}</time>
      <time dateTime={row.expiresAt}>{t("sharing.expires", { date: exactUpdate(row.expiresAt, locale) })}</time>
    </div>
    <div className={styles.shareActions}>
      <a className={styles.retryButton} href={path} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`${d.viewShare}: ${title} (${d.newTab})`}
        onClick={event => { if (!onAvailable()) event.preventDefault(); }}>{d.viewShare}</a>
      <button className={styles.retryButton} disabled={disabled || clipboard.pending} onClick={() => { if (onAvailable()) void clipboard.copy(new URL(path, window.location.origin).href); }}>{t("sharing.copy")}</button>
      <button className={styles.retryButton} disabled={disabled} onClick={event => { if (onAvailable()) onRevoke(event.currentTarget); }}>{t("sharing.revoke")}</button>
    </div>
    {clipboard.copied ? <p role="status">{t("sharing.copied")}</p> : null}
    {clipboard.fallback ? <label className={styles.shareUrl}>{t("sharing.url")}<input readOnly value={typeof window === "undefined" ? path : new URL(path, window.location.origin).href} onFocus={event => event.currentTarget.select()} /></label> : null}
  </li>;
}
