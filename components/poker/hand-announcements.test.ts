import { expect, it } from "vitest";
import { createHandAnnouncer, decisionIdentity, handAnnouncement } from "./hand-announcements";
import { gameplayGame } from "@/test/fixtures/gameplay";
import type { Game } from "./types";
import type { GameTranslationKey, TranslationValues } from "@/lib/i18n/types";
import dictionary from "@/lib/i18n/dictionaries/game/en-US";
const game: Game = { ...gameplayGame, poker: { ...gameplayGame.poker, currentActorId: "human" } };
function t(key: GameTranslationKey, values?: TranslationValues) {
  const value = key.split(".").reduce<unknown>((v, k) => v && typeof v === "object" ? Reflect.get(v, k) : null, dictionary);
  return String(value).replace(/\{(\w+)\}/g, (_, k: string) => String(values?.[k] ?? ""));
}
const message = (value = game) => handAnnouncement(value, "owner", false, true, null, t, "en-US");
it("announces initial actionable load once across polling, version changes and overlay changes", () => {
  const state = createHandAnnouncer();
  expect(state.observe(1, false, message())).toContain("Your turn. Pot 150. Call 50.");
  expect(state.observe(2, false, message({ ...game, version: 400 }))).toBe("");
  expect(state.observe(3, false, message())).toBe(""); // overlay position is not decision identity
});
it("distinguishes a new decision and same-street re-action using authoritative bets and legal context", () => {
  const state = createHandAnnouncer();
  state.observe(1, false, message());
  const reraised = { ...game, poker: { ...game.poker, pot: 500,
    legalActions: [{ type: "fold" as const }, { type: "call" as const, amount: 200 }] } };
  expect(decisionIdentity(reraised)).not.toBe(decisionIdentity(game));
  expect(state.observe(2, false, message(reraised))).toContain("Call 200");
  expect(state.observe(3, false, message(reraised))).toBe("");
  expect(message({ ...game, poker: { ...game.poker, handNumber: 2 } })?.identity).not.toBe(message()?.identity);
});
it.each(["hidden return", "offline recovery", "blocked recovery"])("%s waits for a fresh accepted response and drops obsolete turns", () => {
  const state = createHandAnnouncer();
  expect(state.observe(1, true, message())).toBe("");
  expect(state.observe(1, false, message())).toBe("");
  const next = { ...game, poker: { ...game.poker, handNumber: 2 } };
  expect(state.observe(2, false, message(next))).toContain("Your turn");
  state.observe(2, true, message(next));
  expect(state.observe(3, false, message(next))).toBe("");
});
it("suppresses expired, offline, blocked and non-owned turns without exposing cards", () => {
  for (const [token, blocked, online, remaining] of [["owner", false, true, 0], ["other", false, true, null], ["owner", true, true, null], ["owner", false, false, null]] as const) {
    expect(handAnnouncement(game, token, blocked, online, remaining, t, "en-US")).toBeNull();
  }
  expect(message()?.text).not.toMatch(/spades|hearts|clubs|diamonds/);
});
it("summarizes authoritative awards and personal net without detailed cards and resets on teardown", () => {
  const completed: Game = { ...game, poker: { ...game.poker, street: "complete", winnerIds: ["human"],
    winnerAmounts: { human: 150 }, viewerHandResult: { netChange: 100, startStack: 1000, endStack: 1100 } } };
  const summary = message(completed);
  expect(summary?.text).toContain("Human wins 150");
  expect(summary?.text).toContain("100");
  const state = createHandAnnouncer();
  state.observe(0, false, message());
  expect(state.observe(1, false, summary)).toBe(summary?.text);
  expect(state.observe(2, false, summary)).toBe("");
  expect(createHandAnnouncer().observe(1, false, message())).toContain("Your turn");
});

it("announces big blinds without repeating a decision after a display toggle", () => {
  const machine = createHandAnnouncer();
  const chips = message();
  const blinds = handAnnouncement(game, "owner", false, true, null, t, "en-US", "bigBlinds");
  expect(blinds?.text).toContain("big blinds");
  expect(blinds?.identity).toBe(chips?.identity);
  expect(machine.observe(1, false, chips)).not.toBe("");
  expect(machine.observe(1, false, blinds)).toBe("");
});
