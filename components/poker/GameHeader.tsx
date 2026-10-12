"use client";

import type { RefObject } from "react";
import Link from "next/link";
import { addLocalePrefix } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { useI18n } from "@/components/poker/I18nProvider";
import styles from "@/components/poker/GameHeader.module.css";
import { APP_NAME } from "@/lib/constants";
import { getClientPlayerToken } from "@/lib/identity/player-token-client";
import { headerDepartureSeat } from "./header-navigation";
import type { Game } from "./types";

export function GameHeader({ helpRef, onHelp, settingsRef, onSettings, game, loading, mutationsBlocked = false, onLeave }: {
  readonly helpRef: RefObject<HTMLButtonElement | null>;
  readonly onHelp: (opener: HTMLButtonElement) => void;
  readonly settingsRef: RefObject<HTMLButtonElement | null>;
  readonly onSettings: (opener: HTMLButtonElement) => void;
  readonly game: Game | null;
  readonly loading: boolean;
  readonly mutationsBlocked?: boolean;
  readonly onLeave: (seat: number, navigate: boolean) => Promise<boolean>;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const departing = game ? headerDepartureSeat(game.poker.seats ?? game.poker.players, getClientPlayerToken()) : null;
  function handleExit() {
    if (!departing) {
      router.push(addLocalePrefix("/play", locale));
      return;
    }
    const confirmation = game?.status === "waiting" ? "gameHeader.confirmWaiting"
      : game?.status === "complete" ? "gameHeader.confirmComplete" : "gameHeader.confirmDeparture";
    if (window.confirm(t(confirmation))) void onLeave(departing.seat, true);
  }
  return (
    <header className={styles.gameHeader}>
      <div className={styles.gameHeaderInner}>
        <Link href={addLocalePrefix("/", locale)} className={styles.gameHeaderTitle}>{APP_NAME}</Link>
        <div className={styles.controls}>
        <Button ref={helpRef} variant="ghost" size="small" aria-haspopup="dialog" onClick={event => onHelp(event.currentTarget)}>
          {t("gameHeader.help")}
        </Button>
        <Button ref={settingsRef} variant="ghost" size="small" aria-haspopup="dialog" onClick={event => onSettings(event.currentTarget)}>
          {t("settings.title")}
        </Button>
        <Button variant="primary" size="small" disabled={loading || (!!departing && mutationsBlocked)} onClick={handleExit}>
          {t(departing ? "gameHeader.leaveTable" : "gameHeader.lobby")}
        </Button>
        </div>
      </div>
    </header>
  );
}
