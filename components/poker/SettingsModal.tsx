"use client";
import { useRef, type RefObject } from "react";
import { Modal } from "./Modal";
import { Button } from "../Button";
import { useI18n } from "./I18nProvider";
import { addLocalePrefix, hasLocale } from "@/lib/i18n";
import { LANGUAGE_NAMES, SORTED_LOCALES } from "@/lib/i18n/languages";
import type { Settings } from "./settings";
import styles from "./SettingsModal.module.css";
export function SettingsModal({ preferences, onUpdate, onSound, notice, languageBlocked, onNavigate, gameId, onClose, restoreFocus, fallbackFocus }: {
  readonly preferences: Settings;
  readonly onUpdate: (patch: Partial<Pick<Settings, "turnSound" | "gameplayShortcuts" | "cardColours">>) => void;
  readonly onSound: (enabled: boolean) => Promise<void>;
  readonly notice: string | null;
  readonly languageBlocked: boolean;
  readonly onNavigate: () => void;
  readonly gameId: string;
  readonly onClose: () => void;
  readonly restoreFocus: RefObject<HTMLElement | null>;
  readonly fallbackFocus: RefObject<HTMLElement | null>;
}) {
  const { locale, t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  const navigating = useRef(false);
  return <Modal open title={t("settings.title")} onDismiss={onClose} initialFocus={closeRef}
    restoreFocus={restoreFocus} fallbackFocus={fallbackFocus} className={styles.dialog}>
    <div className={styles.header}><h2>{t("settings.title")}</h2>
      <Button ref={closeRef} size="small" onClick={onClose}>{t("settings.close")}</Button></div>
    <div className={styles.content}>
      <p className={styles.note}>{t("settings.continues")}</p>
      {(["turnSound", "gameplayShortcuts"] as const).map(key => <div className={styles.row} key={key}>
        <span id={`settings-${key}`}>{t(key === "turnSound" ? "turnNotification.sound" : "settings.shortcuts")}</span>
        <button type="button" role="switch" aria-labelledby={`settings-${key}`} aria-checked={preferences[key]}
          className={styles.switch} onClick={() => {
            const next = !preferences[key]; onUpdate({ [key]: next });
            if (key === "turnSound") void onSound(next);
          }}><span aria-hidden="true">{preferences[key] ? "✓" : "×"}</span><i aria-hidden="true" /></button>
      </div>)}
      <label className={styles.language}><span>{t("settings.cardColours")}</span>
        <select value={preferences.cardColours} onChange={event => {
          const value = event.target.value;
          if (value === "classic" || value === "four-colour") onUpdate({ cardColours: value });
        }}>
          <option value="classic">{t("settings.classic")}</option>
          <option value="four-colour">{t("settings.fourColour")}</option>
        </select>
      </label>
      {notice ? <p role="status" className={styles.note}>{notice}</p> : null}
      <label className={styles.language}><span>{t("settings.language")}</span>
        <select value={locale} disabled={languageBlocked} aria-describedby={languageBlocked ? "settings-language-blocked" : undefined}
          onChange={event => {
            const next = event.target.value;
            if (languageBlocked || navigating.current || !hasLocale(next) || next === locale) return;
            navigating.current = true; onNavigate();
            window.location.assign(addLocalePrefix(`/game/${gameId}`, next) + window.location.search + window.location.hash);
          }}>
          {SORTED_LOCALES.map(value => <option key={value} value={value}>{LANGUAGE_NAMES[value]}</option>)}
        </select>
      </label>
      {languageBlocked ? <p id="settings-language-blocked" className={styles.note}>{t("settings.languageBlocked")}</p> : null}
    </div>
  </Modal>;
}
