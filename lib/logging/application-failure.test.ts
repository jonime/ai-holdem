import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { PokerRuleError } from "@/lib/poker/types";
import { UsageUnavailableError } from "@/lib/usage/errors";
import { classifyApplicationFailure, logApplicationFailure } from "./application-failure";

const failure = { operation: "read_game", category: "unexpected", status: 500 } as const;
afterEach(() => vi.restoreAllMocks());

it("emits exactly the allowed fields with a fresh server UUID", () => {
  const sink = vi.spyOn(console, "error").mockImplementation(() => {});
  logApplicationFailure(failure);
  logApplicationFailure(failure);
  expect(sink).toHaveBeenCalledTimes(2);
  const event = sink.mock.calls[0][0];
  expect(event).toEqual({ event: "application_request_failed", ...failure, requestReference: expect.any(String) });
  expect(z.uuid().safeParse(event.requestReference).success).toBe(true);
  expect(event.requestReference).not.toBe(sink.mock.calls[1][0].requestReference);
  expect(sink.mock.calls[0]).toHaveLength(1);
});

it.each([
  { ...failure, operation: "secret-operation" },
  { ...failure, category: "secret-category" },
  { ...failure, status: "500" },
  { ...failure, status: 200 },
  { ...failure, status: 600 },
  { ...failure, status: 500.5 },
  { ...failure, metadata: { secret: "secret" } },
  { ...failure, requestReference: "caller-reference" },
])("silently rejects invalid or extra fields", input => {
  const sink = vi.spyOn(console, "error").mockImplementation(() => {});
  // Exercise the runtime boundary independently of its TypeScript contract.
  logApplicationFailure(input as Parameters<typeof logApplicationFailure>[0]);
  expect(sink).not.toHaveBeenCalled();
});

it("uses fixed categories only for recognized classes", () => {
  expect(classifyApplicationFailure(new z.ZodError([]))).toBe("invalid_data");
  expect(classifyApplicationFailure(new PokerRuleError("secret"))).toBe("poker_rule");
  expect(classifyApplicationFailure(new UsageUnavailableError())).toBe("usage_unavailable");
  expect(classifyApplicationFailure({ name: "PokerRuleError", code: "usage_unavailable" })).toBe("unexpected");
});

it("never reads or serializes exception data", () => {
  const sink = vi.spyOn(console, "error").mockImplementation(() => {});
  const serializer = vi.fn(() => "SERIALIZER_SECRET");
  const error = Object.assign(new Error("MESSAGE_SECRET", { cause: { secret: "CAUSE_SECRET" } }), {
    stack: "STACK_SECRET", payload: "PAYLOAD_SECRET", toJSON: serializer, toString: serializer,
  });
  const getter = vi.fn(() => { throw new Error("GETTER_SECRET"); });
  const hostile = Object.defineProperties({}, Object.fromEntries(
    ["message", "name", "code", "cause", "stack", "toJSON"].map(key => [key, { get: getter, enumerable: true }]),
  ));
  for (const exception of [error, hostile, "STRING_SECRET", null]) {
    logApplicationFailure({ ...failure, category: classifyApplicationFailure(exception) });
  }
  expect(sink).toHaveBeenCalledTimes(4);
  expect(JSON.stringify(sink.mock.calls)).not.toContain("SECRET");
  expect(serializer).not.toHaveBeenCalled();
  expect(getter).not.toHaveBeenCalled();
});

it("contains sink and validation failures", () => {
  vi.spyOn(console, "error").mockImplementation(() => { throw new Error("SINK_SECRET"); });
  expect(() => logApplicationFailure(failure)).not.toThrow();
  const hostile = new Proxy(failure, { ownKeys() { throw Error("VALIDATION_SECRET"); } });
  expect(() => logApplicationFailure(hostile)).not.toThrow();
  expect(classifyApplicationFailure(new Proxy({}, { getPrototypeOf() { throw Error("SECRET"); } }))).toBe("unexpected");
});


it("rejects custom serializers in logger input without invoking them", () => {
  const sink = vi.spyOn(console, "error").mockImplementation(() => {});
  const serializer = vi.fn(() => "SECRET");
  logApplicationFailure({ ...failure, toJSON: serializer } as Parameters<typeof logApplicationFailure>[0]);
  expect(sink).not.toHaveBeenCalled();
  expect(serializer).not.toHaveBeenCalled();
});
