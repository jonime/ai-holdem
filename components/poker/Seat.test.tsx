import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import enGame from "@/lib/i18n/dictionaries/game/en-US";
import { gameplayGame } from "@/test/fixtures/gameplay";
import { publicPlayerSchema } from "@/lib/http/schemas";
import { I18nProvider } from "./I18nProvider";
import type { LatestPlayerAction } from "./types";
import { Seat } from "./Seat";
import { describeSeatStatus } from "./view-model";

function render(overrides = {}, isViewer = true, showCurrentHand = true, handActive = true,
  state: { active?: boolean; latestAction?: LatestPlayerAction; winner?: boolean; winnerAmount?: number } = {}) {
  const player = publicPlayerSchema.parse({ ...gameplayGame.poker.players[0], inHand: true,
    folded: false, allIn: false, leaving: false, bestHand: null, currentHandCategory: "flush", ...overrides });
  return renderToStaticMarkup(<I18nProvider locale="en-US" dictionary={enGame}>
    <Seat player={player} isViewer={isViewer} showCurrentHand={showCurrentHand} handActive={handActive}
      active={state.active ?? true} winner={state.winner ?? false} winnerAmount={state.winnerAmount ?? null}
      latestAction={state.latestAction ?? null} dealerSeat={null}
      smallBlindSeat={null} bigBlindSeat={null} gameWinner={false} />
  </I18nProvider>);
}
it("renders current category and status as separate elements using explicit identity", () => {
  expect(render()).toMatch(/aria-label="Current hand: Flush"><span aria-hidden="true">Flush<\/span><\/span><span[^>]*>Your turn<\/span>/);
  expect(render({}, false)).not.toContain("data-current-hand");
  expect(render({}, false)).toMatch(/data-hand-category-slot="true" aria-hidden="true"><\/span>/);
  expect(render({}, false)).toContain(">Thinking</span>");
  expect(render({}, true, false)).not.toContain("data-current-hand");
  expect(render({}, true, false)).toMatch(/data-hand-category-slot="true" aria-hidden="true"><\/span>/);
  expect(render({ bestHand: "flush" }, true, true, false)).not.toContain("data-current-hand");
  expect(render({ bestHand: "flush" }, true, true, false)).toContain(">Flush</span>");
});
it("reserves accessible-hidden space before a category exists", () => {
  expect(render({ currentHandCategory: null })).toMatch(/data-current-hand="true" aria-hidden="true"><\/span>/);
});
it.each([
  [{ leaving: true }, "Leaving after this hand"],
  [{ stack: 0, inHand: false }, "Busted"],
  [{ inHand: false }, "Waiting for next hand"],
  [{ folded: true }, "Folded"],
  [{ allIn: true }, "All-in"],
])("preserves status precedence for %j", (patch, expected) => {
  const player = { leaving: false, inHand: true, folded: false, allIn: false, stack: 100, active: true, isViewer: true, ...patch };
  expect(describeSeatStatus(player, null, enGame.seat, enGame.actions, "en-US")).toBe(expected);
});

it.each(["bet", "raise"])("shows %s once in the top badge, preserving authoritative bottom statuses", action => {
  const state = { active: false, latestAction: { action, amount: 100 } };
  const html = render({}, false, true, true, state);
  expect(html).toContain(`${action.toUpperCase()} 100`);
  expect(html).not.toContain("data-seat-status");
  for (const [patch, text] of [
    [{ leaving: true }, "Leaving after this hand"], [{ folded: true }, "Folded"],
    [{ allIn: true }, "All-in"], [{ inHand: false }, "Waiting for next hand"],
    [{ inHand: false, stack: 0 }, "Busted"],
  ] as const) expect(render(patch, false, true, true, state)).toContain(`>${text}</span>`);
  expect(render({}, true, true, true, { ...state, active: true })).toContain(">Your turn</span>");
  expect(render({}, false, true, true, { ...state, active: true })).toContain(">Thinking</span>");
  expect(render({}, false, true, true, { ...state, latestAction: { action: "call", amount: 100 } })).toContain(">Call 100</span>");
  expect(render({ bestHand: "flush" }, false, true, false, { ...state, winner: true, winnerAmount: 100 })).toContain(">+100</span>");
});

it("renders native bot dialog buttons while human names remain text", () => {
  expect(render({ controller: "bot", name: "Same", bot: null })).toContain('aria-label="About Same" aria-haspopup="dialog"');
  expect(render({ controller: "bot", name: "Same", bot: null })).toMatch(/<button type="button"[^>]*><span>Same<\/span><\/button>/);
  expect(render({ controller: "human", name: "Same" })).not.toContain('aria-haspopup="dialog"');
});


it("groups an occupied seat by player name while exposing stack, current bet and bot control", () => {
  const html = render({ name: "Readable bot", controller: "bot" });
  expect(html).toContain('role="group" aria-label="Readable bot"');
  expect(html).toContain('class="sr-only">Stack: </span>');
  expect(html).toContain('class="sr-only">Bet: ');
  expect(html).toContain('aria-label="About Readable bot"');
  expect(html).not.toContain('tabindex="0"');
});
