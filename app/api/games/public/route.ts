import { classifyApplicationFailure, logApplicationFailure } from "@/lib/logging/application-failure";
import { directoryRouteQuerySchema, type DirectoryResponse } from "@/lib/http/discovery-contracts";
import { NextResponse } from "next/server";

import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import { decodePublicDirectoryCursor, getPublicDirectoryPage } from "@/lib/poker/public-directory-cache";

export async function GET(request: Request) {
  const { cursor: cursorValue } = directoryRouteQuerySchema.parse({ cursor: new URL(request.url).searchParams.get("cursor") });
  const cursor = decodePublicDirectoryCursor(cursorValue);
  if (cursorValue && !cursor) {
    return NextResponse.json({ error: "Invalid directory cursor" }, { status: 400 });
  }
  try {
    const page = await getPublicDirectoryPage(
      getPlayerTokenFromRequest(request),
      cursor,
    );
    return NextResponse.json(
      page satisfies DirectoryResponse,
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    logApplicationFailure({ operation: "public", category: classifyApplicationFailure(error), status: 500 });
    return NextResponse.json({ error: "Unable to load public games" }, { status: 500 });
  }
}
