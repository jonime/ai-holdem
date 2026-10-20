import { afterEach, expect, it, vi } from "vitest";
import { buildIdentifier } from "../build-identifier";
import { api, HttpError, TransportError } from "./api";
import { captureDiagnostic, diagnosticSchema, formatDiagnostics, recoveryDiagnostics } from "./diagnostics";
const reference = "0bd9c338-033b-4f52-a06d-129927318d54";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
async function failure(body: unknown, status = 500) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
  return api.games.get({ gameId: "PRIVATE_GAME_TOKEN" }).catch(error => error);
}
it.each([reference, undefined, "https://secret.example/token", {}, null])("discards malformed metadata without changing error classification (%s)", async requestReference => {
  const error = await failure({ error: "SECRET_MESSAGE", code: "ORIGINAL", requestReference });
  expect(error).toBeInstanceOf(HttpError);
  expect(error).toMatchObject({ message: "SECRET_MESSAGE", status: 500, code: "ORIGINAL", requestReference: requestReference === reference ? reference : undefined });
  const report = captureDiagnostic(error);
  expect(report[0]).toMatchObject({ operation: "games.get", kind: "http", status: 500 });
  expect(formatDiagnostics(report)).not.toMatch(/PRIVATE|SECRET|secret\.example/);
  expect(formatDiagnostics(report)).toContain(requestReference === reference ? reference : "Server reference unavailable");
});
it("captures a timestamp once and formats only allowed fields", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  const error = await failure({ error: "SECRET_STACK cookies=secret cards=As URL=https://secret/", requestReference: reference, payload: "SECRET" });
  const report = captureDiagnostic(error);
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  expect(captureDiagnostic(error)).toEqual(report);
  expect(report[0].timestamp).toBe("2026-10-20T12:00:00.000Z");
  expect(formatDiagnostics([{ ...report[0], payload: "SECRET" } as typeof report[0]])).not.toContain("SECRET");
});
it("normalizes raw network failures without reading hostile messages", async () => {
  const hostile = new Proxy({}, { get() { throw Error("SECRET"); }, getPrototypeOf() { throw Error("SECRET"); } });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(hostile));
  const error = await api.games.get({ gameId: "SECRET" }).catch(error => error);
  expect(error).toBeInstanceOf(TransportError);
  expect(formatDiagnostics(captureDiagnostic(error))).toContain("Server reference unavailable");
  expect(captureDiagnostic(hostile, "games.get")).toEqual([]);
  expect(formatDiagnostics([hostile as never])).toBe("");
});
it("supports invalid successes, deadlines and caller cancellation without changing recovery kinds", async () => {
  const invalid = await failure({ payload: "SECRET" }, 200);
  expect(invalid).toMatchObject({ kind: "invalidResponse", status: 200 });
  expect(captureDiagnostic(invalid)[0].requestReference).toBeUndefined();
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  const pending = api.games.reveal({ gameId: "SECRET", handNumber: 1, expectedVersion: 0 }).catch(error => error);
  await vi.advanceTimersByTimeAsync(15_000);
  const deadline = await pending;
  expect(deadline.kind).toBe("deadline");
  expect(captureDiagnostic(deadline)[0].operation).toBe("games.reveal");
  const controller = new AbortController();
  const cancelled = api.games.reveal({ gameId: "SECRET", handNumber: 1, expectedVersion: 0 }, { signal: controller.signal }).catch(error => error);
  controller.abort();
  expect(captureDiagnostic(await cancelled)).toEqual([]);
});
it("keeps expected failures unreportable and caps original plus recovery records", async () => {
  expect(captureDiagnostic(await failure({ requestReference: reference }, 409))).toEqual([]);
  const original = captureDiagnostic(await failure({ requestReference: reference }));
  const recovery = await failure({});
  const report = recoveryDiagnostics(original, recovery);
  expect(report).toHaveLength(2);
  expect(formatDiagnostics([...report, ...report])).toContain("Recovery failure");
  expect(formatDiagnostics([...report, ...report]).match(/timestamp:/g)).toHaveLength(2);
  expect(diagnosticSchema.safeParse({ ...report[0], build: "https://SECRET" }).success).toBe(false);
});

it.each([undefined, "https://PRIVATE/deployment", "secret", "abc123", {}, 12])("uses a neutral build for unvalidated values", value => {
  expect(buildIdentifier(value)).toBe("local/unknown");
  expect(buildIdentifier("ABCDEF1234567890ABCDEF1234567890ABCDEF12")).toBe("abcdef1234567890abcdef1234567890abcdef12");
});
it("malformed references preserve expected retry and conflict metadata", async () => {
  const error = await failure({ error: "Wait", code: "BOT_STEP_IN_PROGRESS", retryAfterMs: 1000, requestReference: { secret: "PRIVATE" } }, 409);
  expect(error).toMatchObject({ status: 409, code: "BOT_STEP_IN_PROGRESS", retryAfterMs: 1000, requestReference: undefined });
  expect(captureDiagnostic(error)).toEqual([]);
});
