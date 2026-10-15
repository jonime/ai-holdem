import { useRef, type RefObject } from "react";
import { Button } from "../Button";
import { Modal } from "./Modal";
import { useI18n } from "./I18nProvider";
import { botInformation } from "./bot-information";
import type { PublicPokerPlayer } from "./types";
import { addLocalePrefix } from "@/lib/i18n";
import styles from "./BotInformationModal.module.css";

export function BotInformationModal({ player, onClose, restoreFocus, fallbackFocus }: {
  readonly player: PublicPokerPlayer;
  readonly onClose: () => void;
  readonly restoreFocus: RefObject<HTMLElement | null>;
  readonly fallbackFocus: RefObject<HTMLElement | null>;
}) {
  const { dictionary, locale, t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  const info = botInformation(player, dictionary);
  return <Modal open title={t("botInformation.title")} onDismiss={onClose} initialFocus={closeRef}
    restoreFocus={restoreFocus} fallbackFocus={fallbackFocus} className={styles.dialog}>
    <div className={styles.header}>
      <h2>{t("botInformation.title")}</h2>
      <Button ref={closeRef} size="small" onClick={onClose}>{t("settings.close")}</Button>
    </div>
    <div className={styles.content}>
      <h3>{player.name}</h3>
      <p className={styles.label}>{info.label}</p>
      <p>{info.description}</p>
      {info.configuration ? <p className={styles.configuration}>{info.configuration}</p> : null}
      {info.notes.map(note => <p key={note}>{note}</p>)}
      <a href={addLocalePrefix("/about", locale)} target="_blank" rel="noopener noreferrer">
        {t("botInformation.learnMore")} <span>{t("botInformation.newTab")}</span>
      </a>
    </div>
  </Modal>;
}
