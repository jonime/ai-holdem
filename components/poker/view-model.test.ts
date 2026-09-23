import { describe, expect, it } from "vitest";

import type { PublicPokerPlayer } from "@/lib/poker/types";
import {
  arrangeSeats,
  canManageTable,
  describeHandResult,
  describeSeatStatus,
  filledSeatCount,
  parseProbabilities,
  seatMarkersForSeat,
} from "./view-model";

describe("view-model", () => {
  it("arranges seats around the viewer for small and larger tables", () => {
    const players: PublicPokerPlayer[] = [
      {
        id: "p1",
        name: "A",
        controller: "human",
        aiDifficulty: null,
        seat: 0,
        status: "claimed",
        playerToken: "t1",
        isHost: true,
        leaving: false,
        inHand: true,
        stack: 1000,
        folded: false,
        allIn: false,
        holeCards: ["As", "Kd"],
      },
      {
        id: "p2",
        name: "B",
        controller: "typesafe_ai",
        aiDifficulty: "medium",
        seat: 1,
        status: "bot",
        playerToken: null,
        isHost: false,
        leaving: false,
        inHand: true,
        stack: 1000,
        folded: false,
        allIn: false,
        holeCards: ["Qh", "Js"],
      },
      {
        id: "p3",
        name: "C",
        controller: "human",
        aiDifficulty: null,
        seat: 2,
        status: "claimed",
        playerToken: null,
        isHost: false,
        leaving: false,
        inHand: true,
        stack: 1000,
        folded: false,
        allIn: false,
        holeCards: ["2c", "7d"],
      },
      {
        id: "p4",
        name: "D",
        controller: "typesafe_ai",
        aiDifficulty: "hard",
        seat: 3,
        status: "bot",
        playerToken: null,
        isHost: false,
        leaving: false,
        inHand: true,
        stack: 1000,
        folded: false,
        allIn: false,
        holeCards: ["9s", "4h"],
      },
      {
        id: "p5",
        name: "E",
        controller: "typesafe_ai",
        aiDifficulty: "easy",
        seat: 4,
        status: "bot",
        playerToken: null,
        isHost: false,
        leaving: false,
        inHand: true,
        stack: 1000,
        folded: false,
        allIn: false,
        holeCards: ["6d", "Ah"],
      },
      {
        id: "p6",
        name: "F",
        controller: "human",
        aiDifficulty: null,
        seat: 5,
        status: "claimed",
        playerToken: null,
        isHost: false,
        leaving: false,
        inHand: true,
        stack: 1000,
        folded: false,
        allIn: false,
        holeCards: ["5c", "Tc"],
      },
    ];

    expect(arrangeSeats(players, "p1")).toMatchObject({
      bottom: [{ id: "p6" }, { id: "p1" }, { id: "p2" }],
      top: [{ id: "p5" }, { id: "p4" }, { id: "p3" }],
    });
    expect(arrangeSeats(players.slice(0, 2), "p1")).toMatchObject({
      bottom: [{ id: "p1" }],
      top: [{ id: "p2" }],
    });
    expect(arrangeSeats(players.slice(0, 3), "p2")).toMatchObject({
      bottom: [{ id: "p2" }],
      top: [{ id: "p1" }, { id: "p3" }],
    });
    expect(arrangeSeats(players.slice(0, 5), "p1")).toMatchObject({
      bottom: [{ id: "p5" }, { id: "p1" }, { id: "p2" }],
      top: [{ id: "p4" }, { id: "p3" }],
    });
    expect(arrangeSeats(players.slice(0, 6), "p1")).toMatchObject({
      bottom: [{ id: "p6" }, { id: "p1" }, { id: "p2" }],
      top: [{ id: "p5" }, { id: "p4" }, { id: "p3" }],
    });
  });

  it("describes split-pot results and permissions", () => {
    expect(describeHandResult(["Alice", "Bob"])).toBe("Split pot: Alice & Bob");

    expect(canManageTable([], "viewer")).toBe(true);
    expect(
      canManageTable([{ isHost: true, playerToken: "viewer" }], "viewer"),
    ).toBe(true);
    expect(
      canManageTable([{ isHost: true, playerToken: "other" }], "viewer"),
    ).toBe(false);
    expect(
      filledSeatCount([
        { status: "claimed" },
        { status: "bot" },
        { status: "open" },
      ]),
    ).toBe(2);
  });

  it("prioritizes the seat-status labels exactly as the UI expects", () => {
    const playerBase = {
      id: "p1",
      name: "Hero",
      controller: "human",
      seat: 0,
      playerToken: "t1",
      isHost: false,
      leaving: false,
      inHand: true,
      stack: 1000,
      folded: false,
      allIn: false,
      holeCards: ["As", "Kd"],
      status: "claimed" as const,
    };

    expect(describeSeatStatus({ ...playerBase, leaving: true })).toBe(
      "Leaving after this hand",
    );
    expect(describeSeatStatus({ ...playerBase, inHand: false })).toBe(
      "Waiting for next hand",
    );
    expect(describeSeatStatus({ ...playerBase, folded: true })).toBe("Folded");
    expect(describeSeatStatus({ ...playerBase, allIn: true })).toBe("All-in");
    expect(describeSeatStatus({ ...playerBase, active: true })).toBe(
      "Thinking",
    );
    expect(describeSeatStatus({ ...playerBase, active: false })).toBe(
      "Waiting",
    );
    expect(
      describeSeatStatus(
        { ...playerBase, active: false },
        { action: "call", amount: 900 },
      ),
    ).toBe("Call 900");
    expect(
      describeSeatStatus(
        { ...playerBase, active: false },
        { action: "raise", amount: 1800 },
      ),
    ).toBe("Raise 1,800");
  });

  it("keeps terminal seat states ahead of the latest action", () => {
    const player = {
      leaving: false,
      inHand: true,
      folded: true,
      allIn: false,
      active: false,
    };

    expect(describeSeatStatus(player, { action: "fold", amount: null })).toBe(
      "Folded",
    );
  });

  it("guards parseProbabilities against junk input", () => {
    expect(parseProbabilities(null)).toEqual({});
    expect(parseProbabilities({ a: 0.2, b: "bad", c: 0.7 })).toEqual({
      a: 0.2,
      c: 0.7,
    });
    expect(parseProbabilities("nope")).toEqual({});
  });

  it("returns stacked dealer and blind markers for the active hand", () => {
    const game = {
      street: "preflop" as const,
      buttonSeat: 0,
      smallBlindSeat: 0,
      bigBlindSeat: 1,
    };

    expect(seatMarkersForSeat(game, 0)).toEqual([
      {
        key: "dealer",
        label: "D",
        ariaLabel: "Dealer button",
        tone: "dealer",
      },
      {
        key: "smallBlind",
        label: "SB",
        ariaLabel: "Small blind",
        tone: "blind",
      },
    ]);
    expect(seatMarkersForSeat(game, 1)).toEqual([
      {
        key: "bigBlind",
        label: "BB",
        ariaLabel: "Big blind",
        tone: "blind",
      },
    ]);
    expect(
      seatMarkersForSeat(
        {
          ...game,
          street: null,
        },
        0,
      ),
    ).toEqual([]);
  });
});
