import { afterEach, expect, it, vi } from "vitest";
import { creationIP, hashUsageIdentity, normalizeIP } from "./identity";
import { UsageUnavailableError } from "./errors";
afterEach(() => vi.unstubAllEnvs());
it("canonicalizes equivalent IPv6, IPv4-mapped addresses and rejects lists/ports", () => {
  expect(normalizeIP("2001:0db8:0:0:0:0:0:1")).toBe("2001:db8::1");
  expect(normalizeIP("::ffff:192.0.2.1")).toBe("192.0.2.1");
  expect(normalizeIP("::ffff:c000:201")).toBe("192.0.2.1");
  for (const invalid of ["1.2.3.4, 5.6.7.8", "127.0.0.1:80", "garbage", "010.0.0.1"]) expect(normalizeIP(invalid)).toBeNull();
});
it("ignores spoofable forwarding headers outside Vercel and requires explicit local identity", () => {
  vi.stubEnv("VERCEL", "");
  const request = new Request("http://localhost", { headers: { "x-forwarded-for": "1.2.3.4", "x-vercel-forwarded-for": "1.2.3.4", "x-real-ip": "1.2.3.4" } });
  expect(() => creationIP(request)).toThrow(UsageUnavailableError);
  expect(creationIP(request, "127.0.0.1")).toBe("127.0.0.1");
  vi.stubEnv("VERCEL", "1");
  expect(creationIP(request)).toBe("1.2.3.4");
  expect(() => creationIP(new Request("http://localhost", { headers: { "x-forwarded-for": "1.2.3.4" } }), "127.0.0.1")).toThrow(UsageUnavailableError);
});
it("separates HMAC domains and fails closed without a strong secret", () => {
  vi.stubEnv("USAGE_LIMIT_HASH_SECRET", "test-only-32-byte-secret-for-usage-tests");
  expect(hashUsageIdentity("owner", "same")).toMatch(/^[a-f0-9]{64}$/);
  expect(hashUsageIdentity("owner", "same")).not.toBe(hashUsageIdentity("ip", "same"));
  expect(hashUsageIdentity("owner", "same")).toBe(hashUsageIdentity("owner", "same"));
  vi.stubEnv("USAGE_LIMIT_HASH_SECRET", "short");
  expect(() => hashUsageIdentity("owner", "token")).toThrow(UsageUnavailableError);
});
