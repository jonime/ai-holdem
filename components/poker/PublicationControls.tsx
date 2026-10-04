"use client";

import { api } from "@/lib/http/api";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { useI18n } from "./I18nProvider";
import type { Game } from "./types";
import styles from "./LobbyPanel.module.css";

export function PublicationControls({ game, loading, onRefresh }: {
  readonly game: Game;
  readonly loading: boolean;
  readonly onRefresh: () => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(game.publication?.title ?? "");
  const [saving, setSaving] = useState(false);
  const isPublic = game.publication?.isPublic === true;
  const buttonState = saving ? "saving" : isPublic ? "private" : "public";

  useEffect(() => {
    if (!isPublic) return;
    const heartbeat = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void api.discovery.heartbeat({ gameId: game.id }).catch(() => undefined);
      }
    };
    heartbeat();
    const timer = setInterval(heartbeat, 30_000);
    const restore = () => heartbeat();
    document.addEventListener("visibilitychange", restore);
    window.addEventListener("online", restore);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", restore);
      window.removeEventListener("online", restore);
    };
  }, [game.id, isPublic]);

  const update = async (makePublic: boolean) => {
    setSaving(true);
    try {
      await api.discovery.publication({ gameId: game.id, expectedVersion: game.version, isPublic: makePublic, title });
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return <div className={styles.publication}>
    <div><strong>{isPublic ? t("lobby.publication.public") : t("lobby.publication.private")}</strong>
      <p>{t("lobby.publication.explanation")}</p></div>
    <label className={styles.lobbyField}><span>{t("lobby.publication.title")}</span>
      <input maxLength={60} value={title} placeholder={t("lobby.publication.titlePlaceholder")} onChange={(event) => setTitle(event.target.value)} />
    </label>
    <Button className={styles.publicationButton} disabled={loading || saving} onClick={() => void update(!isPublic)}>
      <span className={styles.publicationButtonLabels}>
        <span className={buttonState === "public" ? styles.activeButtonLabel : undefined} aria-hidden={buttonState !== "public"}>
          {t("lobby.publication.makePublic")}
        </span>
        <span className={buttonState === "private" ? styles.activeButtonLabel : undefined} aria-hidden={buttonState !== "private"}>
          {t("lobby.publication.makePrivate")}
        </span>
        <span className={buttonState === "saving" ? styles.activeButtonLabel : undefined} aria-hidden={buttonState !== "saving"}>
          {t("lobby.publication.saving")}
        </span>
      </span>
    </Button>
  </div>;
}
