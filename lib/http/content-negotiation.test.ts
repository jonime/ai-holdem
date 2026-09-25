import { describe, expect, it } from "vitest";

import { negotiatePageRepresentation } from "./content-negotiation";

describe("negotiatePageRepresentation", () => {
  it.each([
    [null, "html"],
    ["*/*", "html"],
    ["text/html", "html"],
    ["text/markdown", "markdown"],
    ["text/markdown, text/html;q=0.8", "markdown"],
    ["text/html, text/markdown", "html"],
    ["text/markdown;q=0, text/html", "html"],
    ["text/*;q=0.9, text/markdown;q=0.8", "html"],
    ["application/json", "not-acceptable"],
  ] as const)("maps %s to %s", (accept, expected) => {
    expect(negotiatePageRepresentation(accept)).toBe(expected);
  });
});
