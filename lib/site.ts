export const PRODUCTION_ORIGIN = "https://ai-holdem.vercel.app";

export function getSiteOrigin(): string {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined);

  if (!configuredOrigin) return PRODUCTION_ORIGIN;

  try {
    const url = new URL(configuredOrigin);
    return url.origin;
  } catch {
    return PRODUCTION_ORIGIN;
  }
}
