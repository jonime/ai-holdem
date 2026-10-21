"use client";
import { useEffect, useRef } from "react";
import type { Game } from "./types";
import { useI18n } from "./I18nProvider";
import { createHandAnnouncer, handAnnouncement } from "./hand-announcements";
import type { AmountDisplay } from "./amounts";
import { turnRemainingMs } from "./turn-clock";

/** Own one quiet live region, including when a native dialog makes the table inert. */
export function useHandAnnouncements(gameId: string | undefined, game: Game | null, token: string | null,
  revision: number, blocked: boolean, online: boolean, mode: AmountDisplay = "chips") {
  const { t, locale } = useI18n();
  const latest = useRef({ game, token, revision, blocked, online, t, locale, mode });
  useEffect(() => { latest.current = { game, token, revision, blocked, online, t, locale, mode }; });
  useEffect(() => {
    const machine = createHandAnnouncer();
    const region = document.createElement("div");
    region.className = "sr-only";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    region.setAttribute("data-hand-announcement", "");
    let parent: Element | null = null;
    function place() {
      const target = Array.from(document.querySelectorAll("dialog[open]")).at(-1) ?? document.body;
      if (target !== parent) {
        // Overlay changes must not replay a previously consumed decision.
        region.textContent = "";
        target.appendChild(region);
        parent = target;
      }
    }
    function update() {
      place();
      const v = latest.current;
      const suppressed = document.hidden || !navigator.onLine || !v.online || v.blocked || !v.game || v.game.id !== gameId;
      const message = v.game ? handAnnouncement(v.game, v.token, v.blocked, v.online,
        turnRemainingMs(v.game), v.t, v.locale, v.mode) : null;
      const text = machine.observe(v.revision, suppressed, message);
      if (suppressed || !message) { if (region.textContent) region.textContent = ""; }
      else if (text) region.textContent = text;
    }
    function resumeBoundary() {
      machine.observe(latest.current.revision, true, null);
      update();
    }
    const observer = new MutationObserver(place);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    document.addEventListener("visibilitychange", resumeBoundary);
    window.addEventListener("offline", resumeBoundary);
    window.addEventListener("online", resumeBoundary);
    place();
    const timer = setInterval(update, 100);
    return () => {
      clearInterval(timer); observer.disconnect(); region.remove();
      document.removeEventListener("visibilitychange", resumeBoundary);
      window.removeEventListener("offline", resumeBoundary);
      window.removeEventListener("online", resumeBoundary);
    };
  }, [gameId]);
}
