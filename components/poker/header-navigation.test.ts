import { expect, it } from "vitest";
import { gameplayGame } from "@/test/fixtures/gameplay";
import { headerDepartureSeat } from "./header-navigation";

const owner = gameplayGame.poker.players[0];
const other = { ...owner, id: "other", seat: 1, playerToken: null, folded: true, stack: 0 };
it("requires another claimed non-leaving human even when folded or eliminated", () => {
  expect(headerDepartureSeat([owner, other], "owner")).toBe(owner);
  expect(headerDepartureSeat([owner, { ...other, status: "open" }], "owner")).toBeNull();
  expect(headerDepartureSeat([owner, { ...other, leaving: true }], "owner")).toBeNull();
  expect(headerDepartureSeat([owner, { ...other, controller: "bot" }], "owner")).toBeNull();
});
it("uses Lobby for spectators, unseated hosts and already-departing owners", () => {
  expect(headerDepartureSeat([owner, other], "spectator")).toBeNull();
  expect(headerDepartureSeat([owner, other], null)).toBeNull();
  expect(headerDepartureSeat([{ ...owner, leaving: true }, other], "owner")).toBeNull();
});
