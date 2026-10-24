"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SettingsModal } from "@/components/poker/SettingsModal";
import { useSettings } from "@/components/poker/useSettings";
import { useI18n } from "@/components/poker/I18nProvider";
import { createTurnAudio } from "@/components/poker/turn-audio";
import { Button } from "@/components/Button";
import { HelpModal } from "@/components/poker/HelpModal";
import styles from "./PublicPageControls.module.css";
export function PublicPageControls({ destination, helpTitle, helpContent }: { destination: string; helpTitle: string; helpContent: ReactNode }) {
  const { t } = useI18n();
  const navigationKey = `${usePathname()}?${useSearchParams().toString()}`;
  const settings = useSettings();
  const [openFor, setOpenFor] = useState<{ navigation: string; kind: "help" | "settings" } | null>(null);
  const [notice, setNotice] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const helpOpener = useRef<HTMLButtonElement>(null);
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
  return <div className={styles.controls}>
    <Button ref={helpOpener} variant="ghost" size="small" aria-haspopup="dialog" onClick={() => setOpenFor({ navigation: navigationKey, kind: "help" })}>{t("gameHeader.help")}</Button>
    <Button ref={opener} variant="ghost" size="small" aria-haspopup="dialog" onClick={() => setOpenFor({ navigation: navigationKey, kind: "settings" })}>{t("settings.title")}</Button>
    {openFor?.navigation === navigationKey && openFor.kind === "settings" ? <SettingsModal preferences={settings.preferences} onUpdate={settings.update} onSound={preview}
      notice={notice ? t("turnNotification.audioUnavailable") : null} languageBlocked={false} destination={destination}
      showContinues={false} onNavigate={() => setOpenFor(null)} onClose={() => setOpenFor(null)} restoreFocus={opener} fallbackFocus={opener} /> : null}
    {openFor?.navigation === navigationKey && openFor.kind === "help" ? <HelpModal title={helpTitle} content={helpContent}
      closeLabel={t("gameHeader.closeHelp")} onClose={() => setOpenFor(null)} restoreFocus={helpOpener} fallbackFocus={helpOpener}
      showTurnWarning={false} cardColours={settings.preferences.cardColours} /> : null}
  </div>;
}
