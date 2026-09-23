import { NextResponse } from "next/server";

import { DEFAULT_LOCALE, hasLocale } from "@/lib/i18n";

export function proxy(request: Request & { readonly nextUrl: URL }) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1];
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".") ||
    hasLocale(firstSegment) ||
    /^[a-z]{2}(?:-[A-Z]{2})?$/.test(firstSegment)
  ) {
    return NextResponse.next();
  }

  const url = new URL(request.url);
  url.pathname =
    pathname === "/" ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next).*)"],
};