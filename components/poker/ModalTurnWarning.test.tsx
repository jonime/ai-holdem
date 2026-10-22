import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "./I18nProvider";
import { ModalTurnProvider, ModalTurnWarning } from "./ModalTurnWarning";
import { observeTurnClock } from "./turn-clock";
import { gameplayGame } from "@/test/fixtures/gameplay";
import dictionary from "@/lib/i18n/dictionaries/game/en-US";

function render(game = gameplayGame, yourTurn = true) {
  return renderToStaticMarkup(<I18nProvider locale="en-US" dictionary={dictionary}>
    <ModalTurnProvider game={game} yourTurn={yourTurn}><ModalTurnWarning /></ModalTurnProvider>
  </I18nProvider>);
}

describe("shared modal turn warning", () => {
  it("shows an owned turn without requiring a timer", () => {
    const html = render();
    expect(html).toContain("Your turn");
    expect(html).toContain("data-modal-turn-warning");
    expect(html).not.toContain('role="timer"');
    expect(html).not.toContain("playerToken");
  });
  it("shows the current authoritative turn countdown when enabled", () => {
    const game = { ...gameplayGame, serverTime: "2026-01-01T00:00:00Z", turnTimer: {
      decisionId: "00000000-0000-4000-8000-000000000001", actorEngineId: "human", handNumber: 1,
      deadline: "2026-01-01T00:01:00Z",
    } };
    observeTurnClock(game);
    expect(render(game)).toContain('role="timer"');
  });
  it("hides the warning when the shell says the turn is ineligible", () => {
    expect(render(gameplayGame, false)).toBe("");
  });
  it("is absent outside a live table, including Play settings and shared replays", () => {
    expect(renderToStaticMarkup(<ModalTurnWarning />)).toBe("");
  });
});
