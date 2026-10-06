import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { UsageUnavailableError } from "./errors";

export function hashUsageIdentity(domain: "owner" | "ip", value: string): string {
  const secret = process.env.USAGE_LIMIT_HASH_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new UsageUnavailableError();
  return createHmac("sha256", secret).update(`ai-holdem:usage:v1:${domain}\0${value}`).digest("hex");
}

export function normalizeIP(value: string): string | null {
  if (value.includes("%") || !isIP(value)) return null;
  if (isIP(value) === 4) return value;
  // WHATWG canonicalization merges compressed/expanded IPv6 spellings.
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(normalized);
  if (mapped) {
    const n = (BigInt(`0x${mapped[1]}`) << 16n) | BigInt(`0x${mapped[2]}`);
    return [24n, 16n, 8n, 0n].map(shift => Number((n >> shift) & 255n)).join(".");
  }
  return normalized;
}

export function creationIP(request: Request, testIdentity?: string): string {
  // Test/local identities are explicitly injected server-side, never request headers.
  const value = process.env.VERCEL === "1"
    ? request.headers.get("x-vercel-forwarded-for")
    : testIdentity;
  const normalized = value ? normalizeIP(value) : null;
  if (!normalized) throw new UsageUnavailableError();
  return normalized;
}

export function localCreationIdentity(): string | undefined {
  if (process.env.VERCEL === "1") return undefined;
  if (process.env.NODE_ENV === "development") return "127.0.0.1";
  // Explicit local production smoke only; supplied by the isolated smoke runner.
  return process.env.USAGE_LIMIT_TEST_IP;
}
