"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SettingsModal } from "@/components/poker/SettingsModal";
import { useSettings } from "@/components/poker/useSettings";
import { useI18n } from "@/components/poker/I18nProvider";
import { createTurnAudio } from "@/components/poker/turn-audio";
import styles from "./page.module.css";
export function PlaySettings({ destination }: { destination: string }) {
  const { t } = useI18n();
  const navigationKey = `${usePathname()}?${useSearchParams().toString()}`;
  const settings = useSettings();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const audio = useRef<ReturnType<typeof createTurnAudio> | null>(null);
  const enabled = useRef(false);
  useEffect(() => {
    const player = createTurnAudio(() => new AudioContext()); audio.current = player;
    return () => { audio.current = null; player.dispose(); };
  }, []);
  async function preview(next: boolean) {
    enabled.current = next; setNotice(false);
    const player = audio.current;
    if (!next || !player) return;
    const ok = await player.unlock();
    if (audio.current !== player || !enabled.current) return;
    if (!ok || !player.play()) setNotice(true);
  }
  return <><button ref={opener} className={styles.retryButton} onClick={() => setOpenFor(navigationKey)}>{t("settings.title")}</button>
    {openFor === navigationKey ? <SettingsModal preferences={settings.preferences} onUpdate={settings.update} onSound={preview}
      notice={notice ? t("turnNotification.audioUnavailable") : null} languageBlocked={false} destination={destination}
      showContinues={false} onNavigate={() => setOpenFor(null)} onClose={() => setOpenFor(null)} restoreFocus={opener} fallbackFocus={opener} /> : null}</>;
}
