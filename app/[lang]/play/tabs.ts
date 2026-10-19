export const playTabs = ["personal", "public", "shared"] as const;
export type PlayTab = typeof playTabs[number];
export function parsePlayTab(value: string | string[] | undefined): PlayTab {
  return value === "public" || value === "shared" ? value : "personal";
}
export function playTabPath(tab: PlayTab) { return tab === "personal" ? "/play" : `/play?tab=${tab}`; }
