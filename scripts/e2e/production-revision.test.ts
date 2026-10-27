import { describe, expect, it, vi } from "vitest";
import { guardedJourney, publicOrigin, PUBLIC_ORIGIN, verifyRevision } from "./production-revision.mjs";

const sha = "a".repeat(40), other = "b".repeat(40);
const response = (build: string) => ({ status: 200, json: async () => ({ build }) });
const options = (request = vi.fn().mockResolvedValue(response(sha))) => ({ request, record: vi.fn() });

describe("fixed public release verification", () => {
  it("accepts only the literal public origin", () => {
    expect(publicOrigin(PUBLIC_ORIGIN)).toBe(PUBLIC_ORIGIN);
    for (const url of [undefined, "https://x.vercel.app", "https://evil.test", PUBLIC_ORIGIN + "/", PUBLIC_ORIGIN + "?x", "https://user@www.aiholdem.gg", "http://www.aiholdem.gg"]) {
      expect(() => publicOrigin(url)).toThrow();
    }
  });
  it("requires 200 and matching JSON with no redirects or cache", async () => {
    const config = options();
    await expect(verifyRevision(sha, config)).resolves.toBe(sha);
    expect(config.request).toHaveBeenCalledWith(PUBLIC_ORIGIN + "/api/build", expect.objectContaining({ redirect: "error", cache: "no-store" }));
    expect(config.record).toHaveBeenCalledWith({ expected: sha, observed: sha, category: "verified" });
  });
  it("waits for a delayed alias within a bounded preflight", async () => {
    let time = 0;
    const config = options(vi.fn().mockResolvedValueOnce(response(other)).mockResolvedValue(response(sha)));
    await expect(verifyRevision(sha, { ...config, timeout: 60_000, now: () => time, sleep: async ms => { time += ms; } })).resolves.toBe(sha);
    expect(time).toBe(2000);
  });
  it.each([response(other), response("local/unknown"), response(""), { status: 200, json: async () => { throw new Error("body must not leak"); } },
    { status: 403 }, { status: 500 }])("rejects mismatch, unknown, invalid JSON and access errors", async result => {
    const config = options(vi.fn().mockResolvedValue(result));
    await expect(verifyRevision(sha, config)).rejects.toThrow("release not verified: production revision mismatch");
    expect(JSON.stringify(config.record.mock.calls)).not.toContain("body must not leak");
  });
  it("times out after 60 seconds without creating a fixture", async () => {
    let time = 0;
    const config = options(vi.fn().mockRejectedValue(new Error("private network details")));
    await expect(verifyRevision(sha, { ...config, timeout: 60_000, now: () => time, sleep: async ms => { time += ms; } })).rejects.toThrow(`expected ${sha}; observed unknown`);
    expect(time).toBe(60_000);
    expect(config.request).toHaveBeenCalledTimes(30);
    const journey = vi.fn(), cleanup = vi.fn();
    await expect(guardedJourney(sha, journey, cleanup, config)).rejects.toThrow();
    expect(journey).not.toHaveBeenCalled(); expect(cleanup).toHaveBeenCalledOnce();
  });
  it("fails a changed release after a journey and still cleans up owned fixtures", async () => {
    const config = options(vi.fn().mockResolvedValueOnce(response(sha)).mockResolvedValue(response(other)));
    const journey = vi.fn(), cleanup = vi.fn();
    await expect(guardedJourney(sha, journey, cleanup, config)).rejects.toThrow(`observed ${other}`);
    expect(journey).toHaveBeenCalledOnce(); expect(cleanup).toHaveBeenCalledOnce();
  });
});
