"use client";
import { useEffect, useRef, useState } from "react";
import { defaultSettings, parseSettings, readSettings, settingsStorageKey, writeSettings, type Settings } from "./settings";
export function useSettings() {
  const [preferences, setPreferences] = useState(defaultSettings);
  const [ready, setReady] = useState(false);
  const current = useRef(defaultSettings);
  useEffect(() => {
    function apply(value: Settings) { current.current = value; setPreferences(value); }
    try { apply(readSettings(window.localStorage)); } catch { apply(defaultSettings); }
    // Read only after hydration; gameplay listeners stay detached until this completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    function storage(event: StorageEvent) {
      try { if (event.storageArea && event.storageArea !== window.localStorage) return; }
      catch { return; }
      if (event.key === settingsStorageKey) apply(parseSettings(event.newValue));
      else if (event.key === null) apply(defaultSettings);
    }
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, []);
  function update(patch: Partial<Pick<Settings, "turnSound" | "gameplayShortcuts" | "cardColours" | "showCurrentHand" | "amountDisplay">>) {
    const next: Settings = { ...current.current, ...patch };
    current.current = next; setPreferences(next);
    try { writeSettings(window.localStorage, next); } catch { /* Storage may be inaccessible. */ }
  }
  return { preferences, ready, update };
}
