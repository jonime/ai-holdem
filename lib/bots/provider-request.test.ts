import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestProviderJson, PROVIDER_DEADLINE_MS } from "./provider-request";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const init = { method: "POST" };

describe("bounded provider requests", () => {
  it.each(["headers", "body"] as const)("aborts stalled %s at the deadline and cleans up", async phase => {
    let signal!: AbortSignal;
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      signal = options.signal!;
      if (phase === "headers") return new Promise<Response>((_, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("private message", "AbortError")));
      });
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('{"partial":'));
        signal.addEventListener("abort", () => controller.error(new DOMException("private body", "AbortError")));
      } }));
    });
    const promise = requestProviderJson(fetcher, "https://provider.invalid", init);
    const rejected = expect(promise).rejects.toMatchObject({ category: "timeout", requestFailure: { phase },
      ...(phase === "body" ? { httpFailure: { httpStatus: 200 } } : {}) });
    await vi.advanceTimersByTimeAsync(PROVIDER_DEADLINE_MS);
    await rejected;
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a stalled credit-error body a timeout, never a credit failure", async () => {
    const rejected = expect(requestProviderJson(async (_url, options) => new Response(new ReadableStream({ start(controller) {
      options.signal!.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
    } }), { status: 402 }), "url", init)).rejects.toMatchObject({
      category: "timeout", httpFailure: { httpStatus: 402 }, requestFailure: { phase: "body" },
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses one lifetime across headers and body", async () => {
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      await new Promise(resolve => setTimeout(resolve, 40_000));
      return new Response(new ReadableStream({ start(controller) {
        options.signal!.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
      } }));
    });
    const rejected = expect(requestProviderJson(fetcher, "url", init)).rejects.toMatchObject({ category: "timeout", requestFailure: { phase: "body" } });
    await vi.advanceTimersByTimeAsync(60_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("finishes and clears its timer without later aborting", async () => {
    let signal!: AbortSignal;
    const result = await requestProviderJson(async (_url, options) => {
      signal = options.signal!;
      return Response.json({ answers: {} });
    }, "url", init);
    expect(result).toEqual({ answers: {} });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(signal.aborted).toBe(false);
  });

  it("normalizes a network rejection without retaining its message", async () => {
    const error = await requestProviderJson(async () => { throw new TypeError("secret-key cards"); }, "url", init).catch(error => error);
    expect(error).toMatchObject({ category: "network" });
    expect(JSON.stringify(error)).not.toContain("secret-key");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { status: 200, body: "broken", category: "invalid_response" },
    { status: 429, body: "broken", category: "rate_limit" },
    { status: 503, body: "broken", category: "provider" },
    { status: 200, body: '{"error":{"code":429}}', category: "rate_limit" },
    { status: 200, body: '{"error":{"code":500,"message":"rate limit"}}', category: "provider" },
    { status: 402, body: '{"error":{"code":402}}', category: "provider" },
  ])("classifies $status / $body as $category", async ({ status, body, category }) => {
    await expect(requestProviderJson(async () => new Response(body, { status }), "url", init)).rejects.toMatchObject({
      category, httpFailure: { httpStatus: status },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("classifies a rejected successful body stream as network failure", async () => {
    await expect(requestProviderJson(async () => new Response(new ReadableStream({ start(controller) {
      controller.error(new TypeError("secret"));
    } })), "url", init)).rejects.toMatchObject({ category: "network", requestFailure: { phase: "body" } });
    expect(vi.getTimerCount()).toBe(0);
  });
});
