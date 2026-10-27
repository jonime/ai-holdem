import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateSharedHandTitle, titleFacts } from "./shared-hand-title";
const players = [{ seat: 0, stack: 100, bet: 0, folded: false, allIn: false, cards: ["As", "Kd"] }, { seat: 1, stack: 0, bet: 0, folded: true, allIn: false, cards: null }];
const frame = { kind: "start", street: "preflop", board: [], pot: 10, nextActorSeat: 0, action: null, players };
const snapshot = { schemaVersion: 1, replay: { dealerSeat: 0, smallBlindSeat: 0, bigBlindSeat: 1, participants: [{ seat: 0, name: "PRIVATE NAME" }, { seat: 1, name: "OTHER NAME" }], frames: [frame, { ...frame, kind: "result", street: "complete" }], pots: [{ amount: 10, awards: [{ seat: 0, amount: 10 }] }] } };
const fetcher = vi.fn();
const response = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
beforeEach(() => { vi.stubEnv("SHARED_HAND_TITLE_MODEL", "openai/gpt-5-nano"); vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true"); vi.stubEnv("LLM_API_ENDPOINT", "https://provider.invalid"); vi.stubEnv("LLM_API_KEY", "secret"); fetcher.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it("only summarizes allowlisted facts from the sanitized snapshot", () => {
  const facts = titleFacts(snapshot);
  expect(facts).not.toMatch(/PRIVATE|OTHER|participants|name|token|gameId|handNumber|https/);
  expect(JSON.parse(facts).frames[0].players[1].cards).toBeNull();
  expect(facts).toContain("As"); expect(facts).toContain('"awards"');
  expect(() => titleFacts({ ...snapshot, gameId: "secret" })).toThrow();
});
it("uses selected language, a separate model and structured output budget", async () => {
  fetcher.mockResolvedValue(response({ title: "Ässähai voittaa pienen potin" }));
  expect(await generateSharedHandTitle(snapshot, "fi-FI", fetcher)).toBe("Ässähai voittaa pienen potin");
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.model).toBe("openai/gpt-5-nano"); expect(body.max_tokens).toBe(256);
  expect(body.messages[0].content).toContain("fi-FI");
  expect(body.response_format.json_schema.strict).toBe(true);
});
it.each([{ title: "" }, { title: "a\nb" }, { title: "x".repeat(81) }, { title: "x", extra: true }, { title: " x " }, { title: "a\u2028b" }, {}])("rejects malformed output %j without retrying", async content => {
  fetcher.mockResolvedValue(response(content));
  expect(await generateSharedHandTitle(snapshot, "en-US", fetcher)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(["disabled", "unset"])("does not infer when %s", async mode => {
  vi.stubEnv(mode === "disabled" ? "EXTERNAL_INFERENCE_ENABLED" : "SHARED_HAND_TITLE_MODEL", mode === "disabled" ? "false" : "");
  expect(await generateSharedHandTitle(snapshot, "en-US", fetcher)).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
});
it.each(["headers", "body"])("bounds hanging %s to eight seconds", async phase => {
  vi.useFakeTimers();
  if (phase === "headers") fetcher.mockImplementation(() => new Promise(() => {}));
  else fetcher.mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: () => new Promise(() => {}) });
  const pending = generateSharedHandTitle(snapshot, "en-US", fetcher);
  await vi.advanceTimersByTimeAsync(8000);
  expect(await pending).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
});
it("isolates provider and malformed JSON failures", async () => {
  fetcher.mockRejectedValue(new Error("private provider failure"));
  expect(await generateSharedHandTitle(snapshot, "en-US", fetcher)).toBeNull();
  fetcher.mockResolvedValue(new Response("invalid"));
  expect(await generateSharedHandTitle(snapshot, "en-US", fetcher)).toBeNull();
});
it("declines oversized summaries", async () => {
  const large = { ...snapshot, replay: { ...snapshot.replay, frames: Array(1000).fill(frame) } };
  expect(await generateSharedHandTitle(large, "en-US", fetcher)).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
});

it("rejects provider HTTP and embedded errors without a fallback", async () => {
  fetcher.mockResolvedValueOnce(new Response("{}", { status: 429 }));
  expect(await generateSharedHandTitle(snapshot, "en-US", fetcher)).toBeNull();
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "private" }, choices: [{ message: { content: JSON.stringify({ title: "A public title" }) } }] })));
  expect(await generateSharedHandTitle(snapshot, "en-US", fetcher)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
