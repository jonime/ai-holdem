import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

function request(pathname: string, accept: string) {
  const url = new URL(pathname, "https://ai-holdem.vercel.app");
  const value = new Request(url, { headers: { Accept: accept } }) as Request & {
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

  it("varies the root HTML redirect by Accept", () => {
    const response = proxy(request("/", "text/html"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://ai-holdem.vercel.app/en-US",
    );
    expect(response.headers.get("vary")).toBe("Accept");
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

  it("does not intercept machine-readable static files", () => {
    const response = proxy(request("/llms.txt", "text/markdown"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
