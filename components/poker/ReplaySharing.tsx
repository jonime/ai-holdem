"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { api, HttpError, unknownOutcome } from "@/lib/http/api";
import type { ActiveShare } from "@/lib/http/share-contracts";
import { addLocalePrefix } from "@/lib/i18n";
import { useI18n } from "./I18nProvider";
import { Modal } from "./Modal";
import replayStyles from "./HandReplayModal.module.css";
import styles from "./ReplaySharing.module.css";
import { Button } from "@/components/Button";

export function ReplaySharing({ gameId, handNumber, open, onAvailabilityChange, onClose, restoreFocus }: {
  onClose: () => void; restoreFocus: RefObject<HTMLElement | null>;
  gameId: string; handNumber: number; open: boolean; onAvailabilityChange: (available: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [share, setShare] = useState<ActiveShare | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"revoke" | null>(null);
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [failure, setFailure] = useState(false);
  const lock = useRef(false);
  const copyLock = useRef(false);
  const [copyPending, setCopyPending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    api.shares.active({ gameId, handNumber }, { signal: abort.signal }).then(result => {
      if (!abort.signal.aborted) { setShare(result.share); setStatus("ready"); }
    }).catch(error => {
      if (!abort.signal.aborted) setStatus(error instanceof HttpError && [403, 404].includes(error.status) ? "forbidden" : "error");
    });
    return () => abort.abort();
  }, [gameId, handNumber, attempt]);
  useEffect(() => {
    if (!share) return;
    // Expiry is enforced by SQL; this timer only retires stale management controls.
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      const remaining = Date.parse(share!.expiresAt) - Date.now();
      if (remaining > 0) timer = setTimeout(schedule, Math.min(2_147_483_647, remaining));
      else { setShare(null); setCopied(false); setFallback(false); setConfirm(null); }
    }
    timer = setTimeout(schedule, 0);
    return () => clearTimeout(timer);
  }, [share]);
  useEffect(() => { onAvailabilityChange(status === "ready" || status === "error"); }, [status, onAvailabilityChange]);
  async function mutate(operation: "create" | "revoke") {
    if (lock.current || status !== "ready") return;
    lock.current = true; setPending(true); setFailure(false); setCopied(false); setFallback(false);
    const signal = controller.current!.signal;
    try {
      if (operation === "create") {
        const result = await api.shares.create({ gameId, handNumber }, { signal });
        if (!signal.aborted) setShare(result.share);
      } else {
        await api.shares.revoke({ gameId, handNumber }, { signal });
        if (!signal.aborted) setShare(null);
      }
      if (!signal.aborted) setConfirm(null);
    } catch (error) {
      if (signal.aborted) return;
      setFailure(true);
      if (unknownOutcome(error) || error instanceof HttpError && error.status >= 500) {
        // A timed-out mutation may have committed. Read, never replay it.
        try {
          const result = await api.shares.active({ gameId, handNumber }, { signal });
          if (!signal.aborted) { setShare(result.share); setConfirm(null); }
        } catch { if (!signal.aborted) setStatus("error"); }
      }
    } finally {
      lock.current = false;
      if (!signal.aborted) setPending(false);
    }
  }
  const url = share ? new URL(addLocalePrefix(`/replay/${share.token}`, locale), window.location.origin).href : "";
  return <Modal open={open && status !== "forbidden"} title={t("sharing.dialogTitle", { hand: handNumber })} onDismiss={onClose}
    initialFocus={closeRef} restoreFocus={restoreFocus} fallbackFocus={restoreFocus}
    className={`${replayStyles.dialog} ${replayStyles.shareDialog}`} dialogClassName={styles.layer}>
    <div className={replayStyles.content}>
      <header className={replayStyles.controls}><h2>{t("sharing.dialogTitle", { hand: handNumber })}</h2>
        <Button ref={closeRef} onClick={onClose}>{t("replay.close")}</Button>
      </header>
      <section className={styles.panel}>
      {status !== "ready" ? <>
        <p role="status">{t(status === "loading" ? "replay.loading" : "sharing.error")}</p>
        {status === "error" ? <Button onClick={() => { setStatus("loading"); setAttempt(a => a + 1); }}>{t("replay.retry")}</Button> : null}
      </> : <>

    {share && confirm !== "revoke" ? <>
      <div className={styles.actions}><Button disabled={pending || copyPending} onClick={async () => {
        if (copyLock.current) return;
        copyLock.current = true; setCopyPending(true); setCopied(false);
        try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setFallback(true); }
        finally { copyLock.current = false; setCopyPending(false); }
      }}>{t("sharing.copy")}</Button>
      <Button disabled={pending} onClick={() => setConfirm("revoke")}>{t("sharing.revoke")}</Button></div>
      <p className={styles.meta}>{t("sharing.expires", { date: new Date(share.expiresAt).toLocaleString(locale) })}</p>
      {copied ? <p role="status">{t("sharing.copied")}</p> : null}
      {fallback ? <label className={styles.url}>{t("sharing.url")} <input readOnly value={url} onFocus={e => e.currentTarget.select()} /></label> : null}
    </> : !share ? <>
      <p className={styles.intro}>{t("sharing.visibilityIntro")}</p>
      <ul className={styles.rules}><li>{t("sharing.visibleCards")}</li><li>{t("sharing.otherCards")}</li></ul>
      <p className={styles.meta}>{t("sharing.notice")}</p>
      <Button disabled={pending} onClick={() => void mutate("create")}>{t("sharing.create")}</Button>
    </> : null}
    {confirm ? <div className={styles.confirmation} role="group" aria-label={t("sharing.revoke")}>
      <p>{t("sharing.revokeNotice")}</p>
      <Button disabled={pending} onClick={() => void mutate(confirm)}>{t("sharing.confirmRevoke")}</Button>
      <Button disabled={pending} onClick={() => setConfirm(null)}>{t("sharing.cancel")}</Button>
    </div> : null}
    {pending ? <p role="status">{t("sharing.pending")}</p> : null}
    {failure ? <p role="alert">{t("sharing.error")}</p> : null}
      </>}
      </section>
    </div>
  </Modal>;
}
