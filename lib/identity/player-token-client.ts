export const PLAYER_TOKEN_COOKIE_NAME = "ai-holdem-player-id";

export function getClientPlayerToken(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cookie = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${PLAYER_TOKEN_COOKIE_NAME}=`));

  if (!cookie) {
    return null;
  }

  return (
    decodeURIComponent(cookie.slice(`${PLAYER_TOKEN_COOKIE_NAME}=`.length)) ||
    null
  );
}
