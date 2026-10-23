"use client";
import { parseThemePreference, resolveTheme, THEME_QUERY, THEME_STORAGE_KEY, type ThemePreference } from "./preference";
let preference: ThemePreference | undefined;
const listeners = new Set<() => void>();
function read(): ThemePreference {
  try { return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY)); }
  catch { return "system"; }
}
export function getThemePreference(): ThemePreference {
  return preference ??= read();
}
export function getResolvedTheme(): "light" | "dark" {
  return resolveTheme(getThemePreference(), window.matchMedia(THEME_QUERY).matches);
}
export function toggleTheme() {
  setThemePreference(getResolvedTheme() === "dark" ? "light" : "dark");
}
function apply() {
  document.documentElement.dataset.theme = getResolvedTheme();
}
function notify() { apply(); listeners.forEach(listener => listener()); }
export function setThemePreference(next: ThemePreference) {
  preference = parseThemePreference(next);
  try { window.localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* The current page still supports appearance changes. */ }
  notify();
}
export function subscribeTheme(listener: () => void) {
  const media = window.matchMedia(THEME_QUERY);
  const onMedia = () => { if (getThemePreference() === "system") notify(); };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    // Ignore unrelated storage areas, but tolerate browsers that deny storage access.
    try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { /* Read the event instead. */ }
    preference = parseThemePreference(event.newValue);
    notify();
  };
  listeners.add(listener);
  apply();
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onMedia);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onMedia);
  };
}
