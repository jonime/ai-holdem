"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "./I18nProvider";
import { turnRemainingMs } from "./turn-clock";
import { notificationEligible, notificationTurn, observeNotification, type TurnObservation } from "./turn-notifications";
import { createTurnAudio, readTurnSound, writeTurnSound, turnSoundStorageKey } from "./turn-audio";
import type { Game } from "./types";

export function useTurnNotifications(game: Game | null, token: string | null, blocked: boolean, online: boolean) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState(false);
  const preference = useRef(false);
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
    function syncPreference() {
      let value = false;
      try { value = readTurnSound(window.localStorage); } catch { /* Storage may be inaccessible. */ }
      preference.current = value; setEnabled(value);
    }
    syncPreference();
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
    function storage(event: StorageEvent) {
      if (event.key === turnSoundStorageKey || event.key === null) syncPreference();
    }
    const timer = setInterval(update, 100);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pointerdown", gesture);
    window.addEventListener("keydown", gesture);
    window.addEventListener("storage", storage);
    update();
    return () => {
      active = false; clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pointerdown", gesture);
      window.removeEventListener("keydown", gesture);
      window.removeEventListener("storage", storage);
      if (assignedTitle !== null && document.title === assignedTitle) document.title = originalTitle;
      observation.current = null; audio.current = null; player.dispose();
    };
  }, []);
  async function toggle() {
    const next = !preference.current;
    preference.current = next; setEnabled(next); setNotice(false);
    try { writeTurnSound(window.localStorage, next); } catch { /* Keep the in-memory preference. */ }
    const player = audio.current;
    if (next && player) {
      const ok = await player.unlock();
      if (audio.current !== player || !preference.current) return;
      if (!ok || !player.play()) setNotice(true);
    }
  }
  return { enabled, toggle, notice: notice ? t("turnNotification.audioUnavailable") : null };
}
