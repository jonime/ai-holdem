import { appendFileSync } from "node:fs";

export const PUBLIC_ORIGIN = "https://www.aiholdem.gg";
export function publicOrigin(value) {
  if (value !== PUBLIC_ORIGIN) throw new Error("Production smoke requires the fixed public origin.");
  return PUBLIC_ORIGIN;
}

/** Never retain response bodies, redirects, exception messages, or unknown revision values. */
export async function verifyRevision(expected, { request = fetch, timeout = 0, now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), record = recordRevision } = {}) {
  if (!/^[a-f0-9]{40}$/.test(expected ?? "")) throw new Error("A validated deployed revision is required.");
  const deadline = now() + timeout;
  let observed = "unknown";
  let category = "revision mismatch";
  do {
    observed = "unknown";
    category = "revision mismatch";
    try {
      const response = await request(`${PUBLIC_ORIGIN}/api/build`, {
        // A zero polling window still permits one full request. Clock advancement
        // between creating the deadline and fetching must not reduce it to 1 ms.
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(
          timeout > 0 ? Math.max(1, Math.min(5000, deadline - now())) : 5000),
      });
      if (response.status !== 200) category = "access failure";
      else {
        const body = await response.json().catch(() => null);
        if (typeof body?.build === "string" && /^[a-f0-9]{40}$/.test(body.build)) observed = body.build;
      }
    } catch { category = "access failure"; }
    if (observed === expected) {
      record({ expected, observed, category: "verified" });
      return observed;
    }
    if (now() >= deadline) break;
    await sleep(Math.min(2000, deadline - now()));
  } while (now() < deadline);
  record({ expected, observed, category });
  throw new Error(`release not verified: production revision mismatch; expected ${expected}; observed ${observed}; ${category}`);
}

function recordRevision(event) {
  if (process.env.PRODUCTION_SMOKE_REVISION_LOG) appendFileSync(process.env.PRODUCTION_SMOKE_REVISION_LOG, JSON.stringify(event) + "\n");
}

/** Post-check failures must never prevent the owner's cleanup. */
export async function guardedJourney(expected, journey, cleanup, options) {
  try {
    await verifyRevision(expected, options);
    try { return await journey(); }
    finally { await verifyRevision(expected, options); }
  } finally { await cleanup(); }
}
