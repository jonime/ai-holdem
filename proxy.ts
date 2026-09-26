import { NextResponse } from "next/server";

import {
  DEVELOPERS_MARKDOWN,
  HOME_MARKDOWN,
  NOT_FOUND_MARKDOWN,
} from "@/lib/agent-content";
import { negotiatePageRepresentation } from "@/lib/http/content-negotiation";
import { DEFAULT_LOCALE, hasLocale } from "@/lib/i18n";

const markdownHeaders = {
  "Content-Type": "text/markdown; charset=utf-8",
  Vary: "Accept",
} as const;

function contentPage(pathname: string): "home" | "developers" | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "home";
  if (segments.length === 1 && hasLocale(segments[0])) return "home";
  if (segments.length === 1 && segments[0] === "developers") {
    return "developers";
  }
  if (
    segments.length === 2 &&
    hasLocale(segments[0]) &&
    segments[1] === "developers"
  ) {
    return "developers";
  }
  return undefined;
}

function isKnownApplicationPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return (
    (segments.length === 3 &&
      hasLocale(segments[0]) &&
      segments[1] === "game" &&
      Boolean(segments[2])) ||
    (segments.length === 2 &&
      hasLocale(segments[0]) &&
      segments[1] === "about") ||
    (segments.length === 1 && segments[0] === "about")
  );
}

function withVaryAccept(response: NextResponse): NextResponse {
  const vary = response.headers.get("Vary");
  if (!vary?.toLowerCase().split(/\s*,\s*/).includes("accept")) {
    response.headers.set("Vary", vary ? `${vary}, Accept` : "Accept");
  }
  return response;
}

export function proxy(request: Request & { readonly nextUrl: URL }) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1];
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const page = contentPage(pathname);
  const representation = negotiatePageRepresentation(
    request.headers.get("Accept"),
  );
  if (representation === "markdown") {
    if (page) {
      return new NextResponse(
        page === "home" ? HOME_MARKDOWN : DEVELOPERS_MARKDOWN,
        { status: 200, headers: markdownHeaders },
      );
    }
    if (isKnownApplicationPath(pathname)) {
      return new NextResponse("No Markdown representation is available.\n", {
        status: 406,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Vary: "Accept",
        },
      });
    }
    return new NextResponse(NOT_FOUND_MARKDOWN, {
      status: 404,
      headers: markdownHeaders,
    });
  }
  if (page && representation === "not-acceptable") {
    return new NextResponse("No acceptable representation is available.\n", {
      status: 406,
      headers: { "Content-Type": "text/plain; charset=utf-8", Vary: "Accept" },
    });
  }
  if (
    hasLocale(firstSegment) ||
    /^[a-z]{2}(?:-[A-Z]{2})?$/.test(firstSegment)
  ) {
    return withVaryAccept(NextResponse.next());
  }

  const url = new URL(request.url);
  url.pathname =
    pathname === "/" ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${pathname}`;
  return withVaryAccept(NextResponse.redirect(url));
}

export const config = {
  matcher: ["/((?!api|_next).*)"],
};
