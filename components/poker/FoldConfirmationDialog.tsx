"use client";

import { useRef, type RefObject } from "react";
import { Button } from "../Button";
import { useI18n } from "./I18nProvider";
import { Modal } from "./Modal";
import { ModalTurnWarning } from "./ModalTurnWarning";
import styles from "./FoldConfirmationDialog.module.css";

/** Both choices share a synchronous lock; the table owns validation and submission. */
export function FoldConfirmationDialog({ onAction, onClose, restoreFocus, fallbackFocus }: {
  onAction: (type: "check" | "fold") => void;
  onClose: () => void;
  restoreFocus: RefObject<HTMLElement | null>;
  fallbackFocus: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const check = useRef<HTMLButtonElement>(null);
  const submitted = useRef(false);
  const choose = (type: "check" | "fold") => {
    if (submitted.current) return;
    submitted.current = true;
    onAction(type);
  };
  return <Modal open title={t("foldConfirmation.title")} onDismiss={onClose}
    initialFocus={check} restoreFocus={restoreFocus} fallbackFocus={fallbackFocus} className={styles.dialog}>
    <div className={styles.header}>
      <h2>{t("foldConfirmation.title")}</h2>
      <Button size="small" onClick={onClose}>{t("settings.close")}</Button>
    </div>
    <ModalTurnWarning />
    <p>{t("foldConfirmation.explanation")}</p>
    <div className={styles.actions}>
      <Button ref={check} variant="primary" onClick={() => choose("check")}>{t("table.check")}</Button>
      <Button onClick={() => choose("fold")}>{t("foldConfirmation.foldAnyway")}</Button>
    </div>
  </Modal>;
}
