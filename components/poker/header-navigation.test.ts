import { expect, it } from "vitest";
import { gameplayGame } from "@/test/fixtures/gameplay";
import { headerDepartureSeat } from "./header-navigation";

const owner = gameplayGame.poker.players[0];
const other = { ...owner, id: "other", seat: 1, playerToken: null, folded: true, stack: 0 };
it("offers departure with another claimed human, including folded, eliminated or departing humans", () => {
  expect(headerDepartureSeat([owner, other], "owner")).toBe(owner);
  expect(headerDepartureSeat([owner, { ...other, leaving: true }], "owner")).toBe(owner);
  const eliminated = { ...owner, folded: true, stack: 0 };
  expect(headerDepartureSeat([eliminated, other], "owner")).toBe(eliminated);
});
it("uses Lobby when there are no other claimed humans", () => {
  expect(headerDepartureSeat([owner], "owner")).toBeNull();
  expect(headerDepartureSeat([owner, { ...other, status: "open" }], "owner")).toBeNull();
  expect(headerDepartureSeat([owner, { ...other, controller: "bot", status: "bot" }], "owner")).toBeNull();
});
it("uses Lobby for spectators, unseated hosts and already-departing owners", () => {
  expect(headerDepartureSeat([owner, other], "spectator")).toBeNull();
  expect(headerDepartureSeat([owner, other], null)).toBeNull();
  expect(headerDepartureSeat([{ ...owner, leaving: true }, other], "owner")).toBeNull();
});

it("uses Lobby for the owned folded or eliminated last human", () => {
  const eliminated = { ...owner, folded: true, stack: 0 };
  expect(headerDepartureSeat([eliminated], "owner")).toBeNull();
});
