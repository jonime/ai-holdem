import "server-only";
import { NextResponse } from "next/server";
import { addLocalePrefix, type Locale } from "@/lib/i18n";
import { getGameDictionary } from "@/lib/i18n/server";
import { UsageLimitError, UsageUnavailableError } from "./errors";
export function usageJsonResponse(error: unknown): NextResponse | null {
  if (error instanceof UsageLimitError) return NextResponse.json({ error: error.message, code: error.code, retryAfterMs: error.retryAfterMs }, {
    status: 429, headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)), "Cache-Control": "private, no-store" },
  });
  if (error instanceof UsageUnavailableError) return NextResponse.json({ error: error.message, code: "USAGE_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  return null;
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
export async function usageCreationResponse(error: unknown, wantsJson: boolean, locale: Locale): Promise<NextResponse | null> {
  const response = usageJsonResponse(error);
  if (!response || wantsJson) return response;
  const { errors } = await getGameDictionary(locale);
  const message = error instanceof UsageLimitError ? errors.gameCreationLimit : errors.usageUnavailable;
  const wait = error instanceof UsageLimitError ? errors.retryAvailable.replace("{seconds}", String(Math.ceil(error.retryAfterMs / 1000))) : "";
  return new NextResponse(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(message)}</title></head><body><main><h1>${escape(message)}</h1><p>${escape(wait)}</p><a href="${addLocalePrefix("/", locale)}">${escape(errors.home)}</a></main></body></html>`, { status: response.status, headers: { ...Object.fromEntries(response.headers), "Content-Type": "text/html; charset=utf-8" } });
}
