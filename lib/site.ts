export const PRODUCTION_ORIGIN = "https://www.aiholdem.gg";

export function getSiteOrigin(): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configuredOrigin) return PRODUCTION_ORIGIN;

  try {
    const url = new URL(configuredOrigin);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return PRODUCTION_ORIGIN;
    }
    return url.origin;
  } catch {
    return PRODUCTION_ORIGIN;
  }
}
