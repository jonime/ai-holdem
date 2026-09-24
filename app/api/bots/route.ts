import { connection, NextResponse } from "next/server";

import { getBotCatalog } from "@/lib/bots/registry";

export async function GET() {
  await connection();
  return NextResponse.json({ bots: getBotCatalog() });
}
