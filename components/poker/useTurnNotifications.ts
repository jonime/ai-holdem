"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "./I18nProvider";
import { turnRemainingMs } from "./turn-clock";
import { notificationEligible, notificationTurn, observeNotification, type TurnObservation } from "./turn-notifications";
import { createTurnAudio } from "./turn-audio";
import type { Game } from "./types";

export function useTurnNotifications(game: Game | null, token: string | null, blocked: boolean, online: boolean, enabled: boolean) {
  const { t } = useI18n();
  const [notice, setNotice] = useState(false);
  const preference = useRef(enabled);
  useEffect(() => { preference.current = enabled; }, [enabled]);
  const audio = useRef<ReturnType<typeof createTurnAudio> | null>(null);
  const observation = useRef<TurnObservation | null>(null);
  const latest = useRef({ game, token, blocked, online, title: t("turnNotification.title") });
  useEffect(() => { latest.current = { game, token, blocked, online, title: t("turnNotification.title") }; });
  useEffect(() => {
    let active = true;
    let originalTitle = document.title;
    let assignedTitle: string | null = null;
    let wasHidden = document.hidden;
    let returnSnapshot: { game: Game | null } | null = null;
    const player = createTurnAudio(() => new AudioContext());
    audio.current = player;
    function update() {
      const value = latest.current;
      const identity = notificationTurn(value.game);
      const eligible = notificationEligible(value.game, value.token, value.blocked, value.online,
        value.game ? turnRemainingMs(value.game) : null);
      if (value.game && identity) {
        const returningRefresh = returnSnapshot !== null && returnSnapshot.game !== value.game;
        const next = observeNotification(returningRefresh ? null : observation.current, value.game.id, identity, eligible, !document.hidden);
        if (returningRefresh) returnSnapshot = null;
        observation.current = next.state;
        if (next.sound && preference.current) player.play();
      }
      if (eligible) {
        if (assignedTitle === null || document.title !== assignedTitle) originalTitle = document.title;
        assignedTitle = value.title; document.title = assignedTitle;
      } else if (assignedTitle !== null) {
        if (document.title === assignedTitle) document.title = originalTitle;
        assignedTitle = null;
      }
    }
    function visibility() {
      if (wasHidden && !document.hidden) returnSnapshot = { game: latest.current.game };
      if (document.hidden) returnSnapshot = null;
      wasHidden = document.hidden;
      update();
    }
    function gesture() {
      if (preference.current) void player.unlock().then(ok => { if (active && !ok) setNotice(true); });
    }
    const timer = setInterval(update, 100);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pointerdown", gesture);
    window.addEventListener("keydown", gesture);
    update();
    return () => {
      active = false; clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pointerdown", gesture);
      window.removeEventListener("keydown", gesture);
      if (assignedTitle !== null && document.title === assignedTitle) document.title = originalTitle;
      observation.current = null; audio.current = null; player.dispose();
    };
  }, []);
  async function preview(next: boolean) {
    preference.current = next; setNotice(false);
    const player = audio.current;
    if (next && player) {
      const ok = await player.unlock();
      if (audio.current !== player || !preference.current) return;
      if (!ok || !player.play()) setNotice(true);
    }
  }
  return { preview, notice: notice ? t("turnNotification.audioUnavailable") : null };
}
