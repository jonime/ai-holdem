"use client";
import { useSyncExternalStore } from "react";
import { getResolvedTheme, getThemePreference, setThemePreference, subscribeTheme, toggleTheme } from "@/lib/theme/controller";
import { parseThemePreference } from "@/lib/theme/preference";
import styles from "./AppearanceControl.module.css";
export type AppearanceLabels = Readonly<{ title: string; system: string; light: string; dark: string }>;
type ToggleLabels = AppearanceLabels & Readonly<{ useLight: string; useDark: string }>;
export function AppearanceControl(props: { labels: ToggleLabels; compact: true } | { labels: AppearanceLabels; compact?: false }) {
  return props.compact ? <ThemeToggle labels={props.labels} /> : <ThemeSelect labels={props.labels} />;
}
function ThemeToggle({ labels }: { labels: ToggleLabels }) {
  const theme = useSyncExternalStore(subscribeTheme, getResolvedTheme, () => "light" as const);
  const action = `${labels.title}: ${theme === "dark" ? labels.useLight : labels.useDark}`;
  return <button type="button" className={styles.compact} onClick={toggleTheme} aria-label={action} title={action}>
    <svg className={styles.icon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {theme === "dark" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" />}
    </svg>
  </button>;
}
function ThemeSelect({ labels }: { labels: AppearanceLabels }) {
  const preference = useSyncExternalStore(subscribeTheme, getThemePreference, () => "system" as const);
  return <label className={styles.control}>
    <span>{labels.title}</span>
    <span className={styles.field}>
      <select value={preference} onChange={event => setThemePreference(parseThemePreference(event.target.value))}>
        <option value="system">{labels.system}</option><option value="light">{labels.light}</option><option value="dark">{labels.dark}</option>
      </select>
    </span>
  </label>;
}
