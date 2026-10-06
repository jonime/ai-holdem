import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

function request(pathname: string, accept: string, language?: string) {
  const url = new URL(pathname, "https://www.aiholdem.gg");
  const headers = new Headers({ Accept: accept });
  if (language !== undefined) headers.set("Accept-Language", language);
  const value = new Request(url, { headers }) as Request & {
    readonly nextUrl: URL;
  };
  Object.defineProperty(value, "nextUrl", { value: url });
  return value;
}

describe("agent content proxy", () => {
  it("serves Markdown from the canonical homepage URL", async () => {
    const response = proxy(request("/", "text/markdown"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(response.headers.get("vary")).toBe("Accept");
    expect(await response.text()).toContain("# AI Hold'em");
  });

  it("continues routing localized HTML requests to the application", () => {
    const response = proxy(request("/en-US", "text/html"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("prevents caching the temporary root HTML redirect", () => {
    const response = proxy(request("/", "text/html"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.aiholdem.gg/en-US",
    );
    expect(response.headers.get("vary")).toBe("Accept, Accept-Language");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  });

  it("selects a language independently for each visitor", () => {
    for (const [language, locale] of [
      ["fi", "fi-FI"],
      ["de", "de-DE"],
    ]) {
      const response = proxy(request("/", "text/html", language));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        `https://www.aiholdem.gg/${locale}`,
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("preserves the unprefixed path and query string", () => {
    const response = proxy(request("/about?source=home", "text/html", "fi"));
    expect(response.headers.get("location")).toBe(
      "https://www.aiholdem.gg/fi-FI/about?source=home",
    );
  });

  it("keeps explicit locale URLs independent of browser language", () => {
    const response = proxy(request("/en-US/about", "text/html", "fi"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.has("location")).toBe(false);
    expect(response.headers.has("cache-control")).toBe(false);
    expect(response.headers.get("vary")).toBe("Accept");
  });

  it("does not redirect unsupported explicit locale URLs", () => {
    const response = proxy(request("/ja-JP", "text/html", "fi"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.has("location")).toBe(false);
  });

  it("keeps Markdown negotiation independent of browser language", async () => {
    const response = proxy(request("/", "text/markdown", "fi"));
    expect(response.status).toBe(200);
    expect(response.headers.get("vary")).toBe("Accept");
    expect(response.headers.has("location")).toBe(false);
    expect(await response.text()).toContain("# AI Hold'em");
  });

  it("serves a Markdown 404 with a discovery link", async () => {
    const response = proxy(
      request("/__ora-404-probe-test", "text/markdown"),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(response.headers.get("vary")).toBe("Accept");
    expect(await response.text()).toMatch(/\[agent and site map\]\(\/llms\.txt\)/);
  });

  it("returns 406 when neither homepage representation is acceptable", () => {
    const response = proxy(request("/", "application/json"));

    expect(response.status).toBe(406);
    expect(response.headers.get("vary")).toBe("Accept");
  });

  it("recognizes About as an HTML-only page for Markdown negotiation", async () => {
    const response = proxy(request("/fi-FI/about", "text/markdown"));

    expect(response.status).toBe(406);
    expect(response.headers.get("vary")).toBe("Accept");
    expect(await response.text()).toBe(
      "No Markdown representation is available.\n",
    );
  });

  it("does not intercept machine-readable static files", () => {
    const response = proxy(request("/llms.txt", "text/markdown"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

it.each(["/play", "/join-game", "/en-US/play", "/en-US/join-game"])("recognizes the Play and compatibility route %s", async path => {
  expect(proxy(request(path, "text/markdown")).status).toBe(406);
  const html = proxy(request(path, "text/html", "fi"));
  if (path.startsWith("/en-US")) expect(html.headers.get("x-middleware-next")).toBe("1");
  else { expect(html.status).toBe(307); expect(html.headers.get("location")).toContain(`/fi-FI${path}`); expect(html.headers.get("cache-control")).toBe("private, no-store"); }
});
