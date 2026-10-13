import { z } from "zod";

export const settingsStorageKey = "ai-holdem-settings";
export const settingsSchema = z.object({
  version: z.literal(1),
  turnSound: z.boolean(),
  gameplayShortcuts: z.boolean(),
  showCurrentHand: z.boolean().default(true),
  cardColours: z.enum(["classic", "four-colour"]).default("classic"),
});
export type Settings = Readonly<z.infer<typeof settingsSchema>>;
export const settingsCodec = z.codec(z.string(), settingsSchema, {
  decode(raw, context) {
    try {
      // The codec validates the decoded JSON against settingsSchema.
      return JSON.parse(raw);
    } catch {
      context.issues.push({ code: "invalid_format", format: "json", input: raw, message: "Invalid settings JSON" });
      return z.NEVER;
    }
  },
  encode: value => JSON.stringify(value),
});
export const defaultSettings: Settings = { version: 1, turnSound: false, gameplayShortcuts: true, showCurrentHand: true, cardColours: "classic" };
export function parseSettings(raw: string | null): Settings {
  if (raw === null) return defaultSettings;
  const result = settingsCodec.safeDecode(raw);
  return result.success ? result.data : defaultSettings;
}
export function readSettings(storage: Pick<Storage, "getItem">): Settings {
  try { return parseSettings(storage.getItem(settingsStorageKey)); } catch { return defaultSettings; }
}
export function writeSettings(storage: Pick<Storage, "setItem">, value: Settings) {
  try { storage.setItem(settingsStorageKey, settingsCodec.encode(value)); } catch { /* Memory remains authoritative for this tab. */ }
}
