"use client";
import { useEffect, useRef, useState } from "react";
import { api, HttpError } from "@/lib/http/api";
import type { ActiveShare } from "@/lib/http/share-contracts";
import { useI18n } from "./I18nProvider";
import { Modal } from "./Modal";
import { ModalTurnWarning } from "./ModalTurnWarning";
import { Button } from "@/components/Button";
import styles from "./ReplaySharing.module.css";
import replayStyles from "./HandReplayModal.module.css";

export function ShareTitleEditor({ share, onSaved, onRefresh }: { share: ActiveShare; onSaved: (share: ActiveShare) => void; onRefresh: () => void }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"conflict" | "error" | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  const lifecycle = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    const epoch = generation;
    lifecycle.current = abort;
    return () => { epoch.current++; abort.abort(); };
  }, []);
  function close() { generation.current++; setEditing(false); }
  async function save() {
    if (lock.current || error === "conflict") return;
    lock.current = true; setPending(true); setError(null);
    const epoch = generation.current;
    try {
      const result = await api.shares.editTitle(share.token, { title: draft.trim() || null, titleRevision: revision }, { signal: lifecycle.current?.signal });
      if (epoch === generation.current) { onSaved(result); close(); }
    } catch (failure) {
      if (epoch === generation.current) setError(failure instanceof HttpError && failure.status === 409 ? "conflict" : "error");
    } finally { lock.current = false; setPending(false); }
  }
  return <>
    <Button ref={opener} onClick={() => { setDraft(share.title ?? ""); setRevision(share.titleRevision); setError(null); setEditing(true); }}>{t("sharing.editTitle")}</Button>
    {editing ? <Modal open title={t("sharing.editTitle")} onDismiss={close} initialFocus={input} restoreFocus={opener} fallbackFocus={opener}
      className={`${replayStyles.dialog} ${replayStyles.shareDialog}`} dialogClassName={styles.layer}>
      <form className={styles.titleForm} aria-busy={pending} onSubmit={event => { event.preventDefault(); void save(); }}>
        <h2>{t("sharing.editTitle")}</h2>
        <ModalTurnWarning />
        <p id={`title-visibility-${share.token}`}>{t("sharing.titleVisibility")}</p>
        <label className={styles.url}>{t("sharing.titleLabel")}<input ref={input} maxLength={80} value={draft} disabled={pending} aria-describedby={`title-visibility-${share.token}`} onChange={event => setDraft(event.target.value)} /></label>
        {pending ? <p role="status">{t("sharing.pending")}</p> : null}
        {error ? <p role="alert">{t(error === "conflict" ? "sharing.titleConflict" : "sharing.titleError")}</p> : null}
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={pending || error === "conflict"}>{t("sharing.saveTitle")}</Button>
          <Button type="button" onClick={close}>{t("sharing.cancel")}</Button>
          {error === "conflict" ? <Button type="button" onClick={() => { close(); onRefresh(); }}>{t("sharing.refreshTitle")}</Button> : null}
        </div>
      </form>
    </Modal> : null}
  </>;
}
