"use client";
import { useEffect, useState } from "react";
import { useI18n } from "./I18nProvider";
import { turnRemainingMs } from "./turn-clock";
import type { Game } from "./types";
import styles from "./TurnCountdown.module.css";

export function TurnCountdown({ game, announce = false }: { game: Game; announce?: boolean }) {
  const { t } = useI18n();
  const [, tick] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const remaining = turnRemainingMs(game);
  const urgent = remaining !== null && remaining < 10_000;
  const expired = remaining === 0;
  useEffect(() => {
    if (!announce || !urgent) return;
    const warning = setTimeout(() => setAnnouncement(t(expired ? "timer.expired" : "timer.warning")), 0);
    return () => clearTimeout(warning);
  }, [announce, urgent, expired, t]);
  useEffect(() => {
    if (!game.turnTimer) return;
    const timer = setInterval(() => tick(value => value + 1), 250);
    return () => clearInterval(timer);
  }, [game]);
  if (remaining === null) return null;
  if (announce) return <>
    {expired ? <span className={styles.expired}>{t("timer.expired")}</span> : null}
    <span role="status" aria-live="polite" aria-atomic="true" className={styles.announcement}>
      {announcement}
    </span>
  </>;
  if (!urgent) return null;
  const seconds = Math.ceil(remaining / 1000);
  return <span data-turn-countdown className={styles.countdown}
    aria-label={t("timer.countdown", { seconds })}>{seconds}</span>;
}
