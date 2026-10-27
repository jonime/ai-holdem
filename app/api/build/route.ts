import { buildIdentifier } from "@/lib/build-identifier";

/** Public release identity only; no runtime environment or database reads. */
export function GET() {
  return Response.json({ build: buildIdentifier(process.env.APP_BUILD_IDENTIFIER) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
