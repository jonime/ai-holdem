import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

function request(pathname: string, accept: string, language?: string, method = "GET") {
  const url = new URL(pathname, "https://www.aiholdem.gg");
  const headers = new Headers({ Accept: accept });
  if (language !== undefined) headers.set("Accept-Language", language);
  const value = new Request(url, { headers, method }) as Request & {
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

  it("continues routing non-English HTML requests to the application", () => {
    const response = proxy(request("/fi-FI", "text/html", "de"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.has("location")).toBe(false);
  });

  it.each([undefined, "fi", "de", "en-US"])(
    "serves English at the root independently of browser language %s", (language) => {
      const response = proxy(request("/", "text/html", language));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.has("location")).toBe(false);
      expect(response.headers.get("vary")).toBe("Accept");
      expect(response.headers.has("cache-control")).toBe(false);
    },
  );

  it.each(["/about", "/play", "/game/table-1", "/new-game", "/quick-game"])(
    "passes English path %s directly to the application", (path) => {
      const response = proxy(request(`${path}?source=home`, "text/html", "fi"));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.has("location")).toBe(false);
    },
  );

  it.each(["", "/about", "/game/table-1", "/quick-game"])(
    "permanently redirects old English path %s with its query", (path) => {
      const response = proxy(request(`/en-US${path}?source=home`, "text/html", "fi"));
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(`https://www.aiholdem.gg${path || "/"}?source=home`);
      expect(response.headers.has("x-middleware-rewrite")).toBe(false);
    },
  );

  it("routes English POST forms without changing their method", () => {
    const current = proxy(request("/quick-game?botMode=rules", "application/json", "fi", "POST"));
    expect(current.headers.has("location")).toBe(false);
    expect(current.headers.get("x-middleware-next")).toBe("1");
    const legacy = proxy(request("/en-US/quick-game?botMode=rules", "application/json", "fi", "POST"));
    expect(legacy.status).toBe(308);
    expect(legacy.headers.get("location")).toBe("https://www.aiholdem.gg/quick-game?botMode=rules");
  });

  it("keeps explicit locale URLs independent of browser language", () => {
    const response = proxy(request("/fi-FI/about", "text/html", "de"));
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

it.each(["/play", "/join-game", "/game/table-1", "/fi-FI/play", "/fi-FI/join-game"])("recognizes HTML-only route %s", async path => {
  expect(proxy(request(path, "text/markdown")).status).toBe(406);
  const html = proxy(request(path, "text/html", "fi"));
  expect(html.headers.has("location")).toBe(false);
  if (path.startsWith("/fi-FI")) expect(html.headers.get("x-middleware-next")).toBe("1");
  else expect(html.headers.get("x-middleware-next")).toBe("1");
});
