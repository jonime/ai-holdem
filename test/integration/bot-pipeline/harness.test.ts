import { describe, expect, it, vi } from "vitest";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { assertLocalOrigin, installNetworkGuard } from "./network";
import { barrier, cleanupAll } from "./harness";

describe("bot pipeline harness boundaries", () => {
  it.each(["https://127.0.0.1:54321", "http://localhost.attacker.test", "http://secret@localhost:54321", "http://localhost:54321/path"])("rejects unsafe client origins: %s", value => {
    expect(() => assertLocalOrigin(value)).toThrow();
  });
  it("blocks fetch, HTTP, HTTPS and raw sockets without leaking destination data", async () => {
    const restore = installNetworkGuard();
    try {
      await expect(fetch("https://external.invalid/secret")).rejects.toThrow("non-loopback");
      expect(() => http.get("http://external.invalid/secret")).toThrow("non-loopback");
      expect(() => https.get("https://external.invalid/secret")).toThrow("non-loopback");
      expect(() => net.connect({ host: "192.0.2.1", port: 80 })).toThrow("non-loopback");
      expect(() => net.connect("/tmp/provider.sock")).toThrow("socket path");
    } finally { restore(); }
  });
  it("forces fetch redirect rejection and preserves the original transport on cleanup", async () => {
    const original = globalThis.fetch;
    const stub = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = stub;
    const restore = installNetworkGuard();
    try {
      await fetch("http://127.0.0.1:54321/", { redirect: "follow" });
      expect(stub).toHaveBeenCalledWith("http://127.0.0.1:54321/", expect.objectContaining({ redirect: "error" }));
    } finally { restore(); globalThis.fetch = original; }
  });
  it("attempts every fixture cleanup even after errors and sanitizes the failure", async () => {
    const first = vi.fn().mockRejectedValue(new Error("private database detail"));
    const second = vi.fn().mockResolvedValue(undefined);
    await expect(cleanupAll([first, second])).rejects.toThrow("Pipeline invariant: fixture cleanup completed");
    expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledOnce();
  });
  it("releases a barrier and bounds a stuck decision without timing sleeps", async () => {
    vi.useFakeTimers();
    try {
      const released = barrier(); released.release(); await released.promise;
      const stuck = barrier(100);
      const assertion = expect(stuck.promise).rejects.toThrow("decision barrier completed before deadline");
      await vi.advanceTimersByTimeAsync(100); await assertion;
      stuck.release();
    } finally { vi.useRealTimers(); }
  });
});
