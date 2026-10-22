"use client";

import { useRef, type RefObject } from "react";
import { FeedbackButton } from "@/components/FeedbackButton";
import { Button } from "@/components/Button";
import { Modal } from "./Modal";
import { ModalTurnWarning } from "./ModalTurnWarning";
import { useI18n } from "./I18nProvider";
import { useShareClipboard } from "./useShareClipboard";
import { inviteUrlFromLocation } from "./view-model";
import type { Game } from "./types";
import styles from "./ShareTableModal.module.css";

export function ShareTableModal({ game, onClose, restoreFocus, fallbackFocus }: {
  readonly game: Game;
  readonly onClose: () => void;
  readonly restoreFocus: RefObject<HTMLElement | null>;
  readonly fallbackFocus: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const copyRef = useRef<HTMLButtonElement>(null);
  const clipboard = useShareClipboard();
  const url = typeof window === "undefined" ? "" : inviteUrlFromLocation(window.location);
  const canJoin = game.status === "waiting" && (game.poker.seats ?? game.poker.players).some(seat => seat.controller === "human" && seat.status === "open");
  return <Modal open title={t("shareTable.title")} onDismiss={onClose} initialFocus={copyRef}
    restoreFocus={restoreFocus} fallbackFocus={fallbackFocus} className={styles.dialog}>
    <header className={styles.header}>
      <h2>{t("shareTable.title")}</h2>
      <ModalTurnWarning />
      <Button size="small" onClick={onClose}>{t("replay.close")}</Button>
    </header>
    <p>{t("shareTable.privacy")}</p>
    <p>{t(canJoin ? "shareTable.seating" : "shareTable.watching")}</p>
    <label className={styles.link}>
      <span>{t("shareTable.url")}</span>
      <input readOnly value={url} onFocus={event => event.currentTarget.select()} onClick={event => event.currentTarget.select()} />
    </label>
    <FeedbackButton ref={copyRef} variant="primary" disabled={clipboard.pending}
      feedback={clipboard.copied} feedbackLabel={t("shareTable.copied")} onFeedbackEnd={clipboard.reset}
      onClick={() => void clipboard.copy(url)}>{t("shareTable.copy")}</FeedbackButton>
    {clipboard.fallback ? <p role="alert">{t("shareTable.manual")}</p> : null}
  </Modal>;
}
