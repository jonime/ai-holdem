"use client";

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

  useEffect(() => {
    if (!isPublic) return;
    const heartbeat = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void fetch(`/api/games/${game.id}/heartbeat`, { method: "POST" });
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
      const response = await fetch(`/api/games/${game.id}/publication`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: game.version, isPublic: makePublic, title }),
      });
      if (!response.ok) throw new Error("publication failed");
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
    <Button size="small" disabled={loading || saving} onClick={() => void update(!isPublic)}>
      {saving ? t("lobby.publication.saving") : isPublic ? t("lobby.publication.makePrivate") : t("lobby.publication.makePublic")}
    </Button>
  </div>;
}
