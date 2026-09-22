import { randomUUID } from "node:crypto";

import type { NextResponse } from "next/server";

export const PLAYER_TOKEN_COOKIE_NAME = "ai-holdem-player-id";
const PLAYER_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 5;

interface CookieValue {
  readonly value?: string;
}

interface CookieStoreLike {
  get(name: string): CookieValue | undefined;
  set(
    name: string,
    value: string,
    attributes?: {
      readonly httpOnly?: boolean;
      readonly sameSite?: "lax" | "strict" | "none";
      readonly path?: string;
      readonly maxAge?: number;
    },
  ): void;
}

export function getPlayerTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${PLAYER_TOKEN_COOKIE_NAME}=`));

  if (!cookie) {
    return null;
  }

  const value = cookie.slice(PLAYER_TOKEN_COOKIE_NAME.length + 1);
  return decodeURIComponent(value) || null;
}

export function setPlayerTokenCookie(
  response: NextResponse,
  token: string,
): NextResponse {
  response.cookies.set(PLAYER_TOKEN_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: PLAYER_TOKEN_MAX_AGE_SECONDS,
  });
  return response;
}

export function getOrCreatePlayerToken(
  request: Request,
  response?: NextResponse,
): string {
  const existingToken = getPlayerTokenFromRequest(request);
  if (existingToken) {
    return existingToken;
  }

  const token = randomUUID();
  if (response) {
    setPlayerTokenCookie(response, token);
  }
  return token;
}

export async function getPlayerToken(
  cookieStore: CookieStoreLike,
): Promise<string> {
  const existingToken = cookieStore.get(PLAYER_TOKEN_COOKIE_NAME)?.value;
  if (existingToken) {
    return existingToken;
  }

  const token = randomUUID();
  cookieStore.set(PLAYER_TOKEN_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: PLAYER_TOKEN_MAX_AGE_SECONDS,
  });

  return token;
}

export type { CookieStoreLike };
