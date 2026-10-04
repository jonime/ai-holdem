import type { z } from "zod";
import type { Immutable } from "@/lib/http/common-contracts";
import { botCatalogResponseSchema } from "@/lib/http/creation-contracts";
import { connection, NextResponse } from "next/server";

import { getBotCatalog } from "@/lib/bots/registry";

export async function GET() {
  await connection();
  return NextResponse.json({ bots: getBotCatalog() } satisfies Immutable<z.input<typeof botCatalogResponseSchema>>);
}
