import { z } from "zod";
import { createGameRequestSchema, creationAttemptIdSchema } from "@/lib/http/creation-contracts";
import { PLAYER_TOKEN_COOKIE_NAME, PLAYER_TOKEN_MAX_AGE_SECONDS } from "@/lib/identity/cookie-policy";
export const attemptStorageKey = "ai-holdem-creation-attempt-v1";
export const intentSchema = z.object({ mode: z.enum(["quick", "custom"]), botMode: z.literal("rules").optional(), settings: createGameRequestSchema.omit({ creationAttemptId: true }) });
export const attemptSchema = z.object({ version: z.literal(1), id: creationAttemptIdSchema, owner: z.string().regex(/^[a-f0-9]{64}$/), intent: intentSchema });
export type Intent = z.infer<typeof intentSchema>;
export type Attempt = z.infer<typeof attemptSchema>;
export class CookiesRequired extends Error {}
export function identityCookie() {
  const value = document.cookie.split(";").map(s => s.trim()).find(s => s.startsWith(`${PLAYER_TOKEN_COOKIE_NAME}=`));
  try { return value ? decodeURIComponent(value.slice(PLAYER_TOKEN_COOKIE_NAME.length + 1)) : null; } catch { return null; }
}
export async function identityFingerprint(establish = false) {
  let token = identityCookie();
  if (!token && establish) {
    const generated = crypto.randomUUID();
    document.cookie = `${PLAYER_TOKEN_COOKIE_NAME}=${generated}; Max-Age=${PLAYER_TOKEN_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
    token = identityCookie();
    if (token !== generated) throw new CookiesRequired();
  }
  if (!token) throw new CookiesRequired();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ai-holdem:creation:browser:v1\0${token}`));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
