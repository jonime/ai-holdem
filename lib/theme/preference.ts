export type ThemePreference = "system" | "light" | "dark";
export const THEME_STORAGE_KEY = "ai-holdem-theme";
export const THEME_QUERY = "(prefers-color-scheme: dark)";
export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
export function resolveTheme(preference: ThemePreference, dark: boolean): "light" | "dark" {
  return preference === "system" ? dark ? "dark" : "light" : preference;
}
// Runs in the document head before paint, independently of React and page caching.
export const THEME_INITIALIZATION = `(function(){var p='system';try{var v=localStorage.getItem('ai-holdem-theme');if(v==='light'||v==='dark')p=v}catch(e){}document.documentElement.dataset.theme=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p})()`;
