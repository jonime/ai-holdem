import { describe, expect, it } from "vitest";
import { initialOverlayNavigation, transitionOverlay, type GameOverlay, type OverlayNavigation } from "./game-overlay";

const eligibility = { isSpectator: true, botInformationAvailable: true, botIds: ["bot"] };
const overlays: GameOverlay[] = [
  { kind: "foldConfirmation", decision: { gameId: "game", handNumber: 1, version: 1, actorId: "human" } },
  { kind: "shareTable" }, { kind: "none" }, { kind: "actions" }, { kind: "results" }, { kind: "join" }, { kind: "help" },
  { kind: "settings" }, { kind: "leave" }, { kind: "botInformation", botId: "bot" },
  { kind: "handReplay", handNumber: 4, origin: "actions" },
  { kind: "handReplay", handNumber: 4, origin: "table" },
  { kind: "handReplay", handNumber: 4, origin: "results" },
];
const state = (overlay: GameOverlay): OverlayNavigation => ({ gameId: "game", overlay });

describe.each(overlays)("overlay $kind", overlay => {
  it("closes to the live table", () => {
    const current = state(overlay);
    expect(transitionOverlay(current, { type: "close", expected: current }).overlay).toEqual({ kind: "none" });
  });
  it.each(overlays.filter(o => o.kind !== "none" && o.kind !== "handReplay"))("replaces with $kind", next => {
    expect(transitionOverlay(state(overlay), { type: "open", overlay: next }).overlay).toEqual(next);
  });
  it("records replay origin for Actions and results", () => {
    expect(transitionOverlay(state(overlay), { type: "replay", handNumber: 9 }).overlay).toEqual({
      kind: "handReplay", handNumber: 9, origin: overlay.kind === "actions" || overlay.kind === "results" ? overlay.kind : "table",
    });
  });
  it("returns only to the replay source overlay", () => {
    const current = state(overlay);
    const next = transitionOverlay(current, { type: "back", expected: current });
    if (overlay.kind === "handReplay" && overlay.origin !== "table") expect(next.overlay).toEqual({ kind: overlay.origin });
    else expect(next).toBe(current);
  });
  it("resets on game changes and keeps valid navigation on refresh", () => {
    const current = state(overlay);
    expect(transitionOverlay(current, { type: "reconcile", gameId: "other", eligibility })).toEqual(initialOverlayNavigation("other"));
    expect(transitionOverlay(current, { type: "reconcile", gameId: "game", eligibility })).toBe(current);
  });
  it.each([
    { ...eligibility, isSpectator: false },
    { ...eligibility, botInformationAvailable: false },
    { ...eligibility, botIds: [] },
  ])("invalidates only Join or bot information when applicable (%j)", changed => {
    const current = state(overlay);
    const invalid = (overlay.kind === "join" && !changed.isSpectator) ||
      (overlay.kind === "botInformation" && (!changed.botInformationAvailable || !changed.botIds.includes(overlay.botId)));
    const next = transitionOverlay(current, { type: "reconcile", gameId: "game", eligibility: changed });
    if (invalid) expect(next.overlay.kind).toBe("none");
    else expect(next).toBe(current);
  });
});

it.each(["replacement", "reopened Join", "another game", "round trip to original game"])("ignores an earlier Join completion after %s", scenario => {
  const joining = state({ kind: "join" });
  // This is the callback captured at submission by useGameOverlay, applied later.
  const complete = (current: OverlayNavigation) => transitionOverlay(current, { type: "close", expected: joining });
  let current = joining;
  if (scenario === "replacement") current = transitionOverlay(current, { type: "open", overlay: { kind: "help" } });
  else if (scenario === "reopened Join") {
    current = transitionOverlay(current, { type: "close", expected: joining });
    current = transitionOverlay(current, { type: "open", overlay: { kind: "join" } });
  } else {
    current = transitionOverlay(current, { type: "reconcile", gameId: "other", eligibility });
    if (scenario.startsWith("round")) current = transitionOverlay(current, { type: "reconcile", gameId: "game", eligibility });
    current = transitionOverlay(current, { type: "open", overlay: { kind: "join" } });
  }
  expect(complete(current)).toBe(current);
  expect(complete(joining).overlay.kind).toBe("none");
});

it("rejects a stale Back callback after replay replacement", () => {
  const replay = state({ kind: "handReplay", handNumber: 4, origin: "actions" });
  const newer = transitionOverlay(replay, { type: "open", overlay: { kind: "settings" } });
  expect(transitionOverlay(newer, { type: "back", expected: replay })).toBe(newer);
});
