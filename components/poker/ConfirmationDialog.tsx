"use client";

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Modal } from "./Modal";
import { Button } from "../Button";
import styles from "./ConfirmationDialog.module.css";

/** Presentation only: the caller owns mutations, reconciliation, and feedback. */
export function ConfirmationDialog({ title, explanation, cancelLabel, confirmLabel, pendingLabel, feedback,
  blocked = false, onConfirm, onClose, restoreFocus, fallbackFocus, children }: {
  title: string; explanation: string; cancelLabel: string; confirmLabel: string; pendingLabel: string;
  feedback?: string | null; blocked?: boolean; onConfirm: () => Promise<void>; onClose: () => void;
  restoreFocus: RefObject<HTMLElement | null>; fallbackFocus: RefObject<HTMLElement | null>; children?: ReactNode;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const dismiss = () => { if (!submitting.current) onClose(); };
  return <Modal open title={title} onDismiss={dismiss} initialFocus={cancelRef}
    restoreFocus={restoreFocus} fallbackFocus={fallbackFocus} className={styles.dialog}>
    <div className={styles.content}>
      <h2>{title}</h2>
      <p>{explanation}</p>
      {feedback ? <p role="alert" className={styles.feedback}>{feedback}</p> : null}
      {pending ? <p role="status">{pendingLabel}</p> : null}
      {children}
    </div>
    <div className={styles.actions}>
      <Button ref={cancelRef} disabled={pending} onClick={dismiss}>{cancelLabel}</Button>
      <Button variant="primary" disabled={pending || blocked} onClick={async () => {
        if (submitting.current || blocked) return;
        submitting.current = true; setPending(true);
        try { await onConfirm(); }
        finally { submitting.current = false; setPending(false); }
      }}>{confirmLabel}</Button>
    </div>
  </Modal>;
}
