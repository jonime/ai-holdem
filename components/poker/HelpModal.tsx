"use client";
import { useRef, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/Button";
import { Modal } from "./Modal";
import { ModalTurnWarning } from "./ModalTurnWarning";
import styles from "./HelpModal.module.css";

export function HelpModal({ title, content, closeLabel, onClose, restoreFocus, fallbackFocus, showTurnWarning = true, cardColours }: {
  title: string; content: ReactNode; closeLabel: string; onClose: () => void;
  restoreFocus: RefObject<HTMLElement | null>; fallbackFocus: RefObject<HTMLElement | null>;
  showTurnWarning?: boolean; cardColours?: "classic" | "four-colour";
}) {
  const close = useRef<HTMLButtonElement>(null);
  return <Modal open title={title} onDismiss={onClose} initialFocus={close} restoreFocus={restoreFocus} fallbackFocus={fallbackFocus} className={styles.helpDialog}>
    <div className={styles.helpHeader}>
      <h2>{title}</h2>
      {showTurnWarning ? <ModalTurnWarning /> : null}
      <Button ref={close} size="small" onClick={onClose}>{closeLabel}</Button>
    </div>
    <div className={styles.helpScroll} data-card-colours={cardColours} tabIndex={0} onClick={event => {
      if (!(event.target instanceof Element)) return;
      const href = event.target.closest("a")?.getAttribute("href");
      if (!href || !/^#help-section-\d+$/.test(href)) return;
      const heading = event.currentTarget.querySelector(href);
      if (!heading) return;
      event.preventDefault();
      heading.scrollIntoView({ block: "start" });
    }}>{content}</div>
  </Modal>;
}
