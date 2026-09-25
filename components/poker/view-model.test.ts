import { describe, expect, it } from "vitest";

import type { PublicPokerPlayer } from "@/lib/poker/types";
import {
  arrangeSeats,
  canManageTable,
  describeHandResult,
  describeSeatStatus,
  feedEventLabel,
  filledSeatCount,
  findGameWinnerId,
  parseProbabilities,
  resolveViewer,
} from "./view-model";

describe("view-model", () => {
  it("labels small and big blind feed events with localized chip amounts", () => {
    expect(
      feedEventLabel({
        type: "blind",
        handNumber: 1,
        player: "Alice",
        controller: "human",
        blind: "small",
        amount: 1_000,
      }),
    ).toBe("Alice posts small blind 1,000");
    expect(
      feedEventLabel({
        type: "blind",
        handNumber: 1,
        player: "Bot",
        controller: "bot",
        blind: "big",
        amount: 2_000,
      }),
    ).toBe("Bot posts big blind 2,000");
  });

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
        controller: "bot",
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
        controller: "bot",
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
        controller: "bot",
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

  it("finds the final winner only after one player remains in a completed hand", () => {
    const players = [
      { id: "winner", stack: 1_000, status: "claimed" as const },
      { id: "busted", stack: 0, status: "bot" as const },
    ];

    expect(findGameWinnerId(players, "river")).toBeNull();
    expect(findGameWinnerId(players, "complete")).toBe("winner");
    expect(
      findGameWinnerId(
        [
          { id: "player-1", stack: 600, status: "claimed" as const },
          { id: "player-2", stack: 400, status: "bot" as const },
        ],
        "complete",
      ),
    ).toBeNull();
    expect(
      findGameWinnerId(
        [...players, { id: "open", stack: 10_000, status: "open" }],
        "complete",
      ),
    ).toBe("winner");
  });

  it("does not attach a spectator to another human seat", () => {
    const players: PublicPokerPlayer[] = [
      {
        id: "other-human",
        name: "Other player",
        controller: "human",
        aiDifficulty: null,
        seat: 0,
        status: "claimed",
        playerToken: null,
        isHost: false,
        leaving: false,
        inHand: true,
        stack: 1_000,
        folded: false,
        allIn: false,
        holeCards: null,
      },
    ];

    expect(resolveViewer(players, "departed-player")).toEqual({
      viewerPlayer: null,
      human: null,
    });
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
    expect(describeSeatStatus({ ...playerBase, inHand: false, stack: 0 })).toBe(
      "Busted",
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
      stack: 1_000,
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
});
