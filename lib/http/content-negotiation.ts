export type PageRepresentation = "html" | "markdown" | "not-acceptable";

type MediaRange = Readonly<{
  type: string;
  subtype: string;
  quality: number;
  order: number;
}>;

function parseQuality(parameters: readonly string[]): number {
  const qualityParameter = parameters.find((parameter) =>
    parameter.trim().toLowerCase().startsWith("q="),
  );
  if (!qualityParameter) return 1;

  const quality = Number(qualityParameter.split("=", 2)[1]?.trim());
  return Number.isFinite(quality) && quality >= 0 && quality <= 1
    ? quality
    : 0;
}

function parseAccept(accept: string): MediaRange[] {
  return accept
    .split(",")
    .map((entry, order) => {
      const [mediaType = "", ...parameters] = entry.trim().split(";");
      const [type = "", subtype = ""] = mediaType
        .toLowerCase()
        .split("/", 2);
      return {
        type,
        subtype,
        quality: parseQuality(parameters),
        order,
      };
    })
    .filter(({ type, subtype }) => Boolean(type && subtype));
}

function specificity(range: MediaRange): number {
  if (range.type === "*") return 0;
  if (range.subtype === "*") return 1;
  return 2;
}

function matches(range: MediaRange, type: string, subtype: string): boolean {
  return (
    (range.type === "*" || range.type === type) &&
    (range.subtype === "*" || range.subtype === subtype)
  );
}

function qualityFor(
  ranges: readonly MediaRange[],
  type: string,
  subtype: string,
): { quality: number; order: number; specificity: number } | undefined {
  return ranges
    .filter((range) => matches(range, type, subtype))
    .sort(
      (left, right) =>
        specificity(right) - specificity(left) || left.order - right.order,
    )
    .map((range) => ({
      quality: range.quality,
      order: range.order,
      specificity: specificity(range),
    }))[0];
}

/** Selects between the two representations served by public content pages. */
export function negotiatePageRepresentation(
  acceptHeader: string | null,
): PageRepresentation {
  if (!acceptHeader?.trim()) return "html";

  const ranges = parseAccept(acceptHeader);
  const markdown = qualityFor(ranges, "text", "markdown");
  const html = qualityFor(ranges, "text", "html");

  const markdownQuality = markdown?.quality ?? 0;
  const htmlQuality = html?.quality ?? 0;
  if (markdownQuality === 0 && htmlQuality === 0) return "not-acceptable";
  if (markdownQuality > htmlQuality) return "markdown";
  if (htmlQuality > markdownQuality) return "html";

  // Wildcards do not express a Markdown preference, so preserve the normal
  // browser response unless Markdown was explicitly listed first.
  if ((markdown?.specificity ?? 0) < 2) return "html";
  if ((html?.specificity ?? 0) < 2) return "markdown";
  return (markdown?.order ?? Number.POSITIVE_INFINITY) <
    (html?.order ?? Number.POSITIVE_INFINITY)
    ? "markdown"
    : "html";
}
