import { describe, expect, it, vi } from "vitest";

import enUsGame from "@/lib/i18n/dictionaries/game/en-US";
import fiFiGame from "@/lib/i18n/dictionaries/game/fi-FI";
import type { PublicPokerPlayer } from "@/lib/poker/types";
import {
  arrangeSeats,
  canManageTable,
  cardLabel,
  copyInviteUrl,
  describeBotConfiguration,
  describeHandResult,
  describeSeatStatus,
  feedEventLabel,
  filledSeatCount,
  findGameWinnerId,
  formatChips,
  inviteUrlFromLocation,
  parseProbabilities,
  resolveViewer,
  selectLobbyGuidance,
  latestActionsForStreet,
} from "./view-model";

const smallBlindEvent = {
  type: "blind",
  handNumber: 1,
  player: "Alice",
  controller: "human",
  blind: "small",
  amount: 1_000,
} as const;

describe("view-model", () => {
  it("returns each player's latest action on the current hand and street", () => {
    const players = [
      { id: "jev-3", name: "TypeSafe Jev #3" },
      { id: "jev-4", name: "TypeSafe Jev #4" },
    ];
    const events = [
      {
        type: "action",
        handNumber: 3,
        player: "TypeSafe Jev #3",
        controller: "bot",
        action: "bet",
        amount: 400,
        street: "flop",
      },
      {
        type: "action",
        handNumber: 2,
        player: "TypeSafe Jev #3",
        controller: "bot",
        action: "raise",
        amount: 800,
        street: "flop",
      },
      {
        type: "action",
        handNumber: 3,
        player: "TypeSafe Jev #4",
        controller: "bot",
        action: "fold",
        amount: null,
        street: "flop",
      },
    ] as const;

    expect(latestActionsForStreet(events, players, 3, "flop")).toEqual({
      "jev-3": { action: "bet", amount: 400 },
      "jev-4": { action: "fold", amount: null },
    });
  });
  it("describes only the bot settings supported by its configuration", () => {
    expect(
      describeBotConfiguration(
        {
          controller: "bot",
          bot: {
            id: "jev",
            label: "TypeSafe Jev",
            provider: "typesafe",
            modelId: "jev-latest",
          },
          aiDifficulty: "hard",
          botProfileId: null,
        },
        enUsGame.seat,
        enUsGame.lobby,
      ),
    ).toBe("Difficulty: Hard");
    expect(
      describeBotConfiguration(
        {
          controller: "bot",
          bot: { id: "llm", label: "LLM", provider: "llm", modelId: "model" },
          aiDifficulty: null,
          botProfileId: "aggressive",
        },
        enUsGame.seat,
        enUsGame.lobby,
      ),
    ).toBe("Playstyle: Aggressive");
  });

  it("labels small and big blind feed events with localized chip amounts", () => {
    expect(feedEventLabel(smallBlindEvent, "en-US", enUsGame.feed)).toBe(
      "Alice posts small blind 1,000",
    );
    expect(
      feedEventLabel(
        {
          type: "blind",
          handNumber: 1,
          player: "Bot",
          controller: "bot",
          blind: "big",
          amount: 2_000,
        },
        "en-US",
        enUsGame.feed,
      ),
    ).toBe("Bot posts big blind 2,000");
    expect(feedEventLabel(smallBlindEvent, "fi-FI", fiFiGame.feed)).toBe(
      `Alice asettaa pienen blindin ${formatChips(1_000, "fi-FI")}`,
    );
  });

  it("labels street events with only the cards revealed on that street", () => {
    expect(
      feedEventLabel(
        {
          type: "street",
          handNumber: 1,
          street: "flop",
          cards: ["Th", "7h", "4c"],
        },
        "en-US",
        enUsGame.feed,
      ),
    ).toBe("Flop  T♥ 7♥ 4♣");
    expect(
      feedEventLabel(
        {
          type: "street",
          handNumber: 1,
          street: "turn",
          cards: ["Th", "7h", "4c", "Ks"],
        },
        "en-US",
        enUsGame.feed,
      ),
    ).toBe("Turn  T♥ 7♥ 4♣ K♠");
  });

  it("labels cards with the supplied suit names instead of an English fallback", () => {
    expect(cardLabel("As", enUsGame.cards)).toBe("A of spades");
    expect(cardLabel("As", fiFiGame.cards)).toBe("A pata");
    expect(cardLabel("7z", enUsGame.cards)).toBe("7 of unknown suit");
    expect(cardLabel("7z", fiFiGame.cards)).toBe("7 tuntematon maa");
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
        committedStreet: 0,
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
        committedStreet: 0,
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
        committedStreet: 0,
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
        committedStreet: 0,
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
        committedStreet: 0,
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
        committedStreet: 0,
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
    expect(describeHandResult(["Alice", "Bob"], enUsGame.history)).toBe(
      "Split pot: Alice & Bob",
    );
    expect(describeHandResult(["Alice", "Bob"], fiFiGame.history)).toBe(
      "Jaettu potti: Alice & Bob",
    );
    expect(describeHandResult(null, enUsGame.history)).toBe("Hand complete");

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

  it("prioritizes host guidance by settings, occupancy, and readiness", () => {
    const creator = {
      status: "claimed" as const,
      playerToken: "creator-token",
    };
    const bot = { status: "bot" as const, playerToken: null };
    const open = { status: "open" as const, playerToken: null };

    expect(
      selectLobbyGuidance({
        players: [creator, open],
        viewerIsHost: true,
        viewerToken: "creator-token",
        settingsValid: false,
      }),
    ).toBe("invalidSettings");
    expect(
      selectLobbyGuidance({
        players: [creator, open],
        viewerIsHost: true,
        viewerToken: "creator-token",
        settingsValid: true,
      }),
    ).toBe("addPlayer");
    expect(
      selectLobbyGuidance({
        players: [creator, bot],
        viewerIsHost: true,
        viewerToken: "creator-token",
        settingsValid: true,
      }),
    ).toBe("ready");
    expect(
      selectLobbyGuidance({
        players: [creator, bot],
        viewerIsHost: true,
        viewerToken: "unseated-host-token",
        settingsValid: true,
      }),
    ).toBe("readyToWatch");
  });

  it("guides seated and unseated guests for open and full tables", () => {
    const guest = {
      status: "claimed" as const,
      playerToken: "guest-token",
    };
    const other = {
      status: "claimed" as const,
      playerToken: "other-token",
    };
    const open = { status: "open" as const, playerToken: null };

    expect(
      selectLobbyGuidance({
        players: [other, open],
        viewerIsHost: false,
        viewerToken: "guest-token",
        settingsValid: true,
      }),
    ).toBe("chooseSeat");
    expect(
      selectLobbyGuidance({
        players: [other, guest],
        viewerIsHost: false,
        viewerToken: "guest-token",
        settingsValid: true,
      }),
    ).toBe("waitingAsPlayer");
    expect(
      selectLobbyGuidance({
        players: [other, guest],
        viewerIsHost: false,
        viewerToken: "spectator-token",
        settingsValid: true,
      }),
    ).toBe("waitingAsSpectator");
  });

  it("builds credential-free invite URLs and reports clipboard outcomes", async () => {
    const inviteUrl = inviteUrlFromLocation({
      origin: "https://user:secret@example.com:8443",
      pathname: "/fi-FI/game/game-id",
    });
    expect(inviteUrl).toBe("https://example.com:8443/fi-FI/game/game-id");
    expect(inviteUrl).not.toContain("user");
    expect(inviteUrl).not.toContain("secret");
    expect(inviteUrl).not.toContain("?");
    expect(inviteUrl).not.toContain("#");

    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyInviteUrl({ writeText }, inviteUrl)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(inviteUrl);

    await expect(
      copyInviteUrl(
        { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
        inviteUrl,
      ),
    ).resolves.toBe(false);
    await expect(copyInviteUrl(undefined, inviteUrl)).resolves.toBe(false);
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
        committedStreet: 0,
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
        committedStreet: 0,
      stack: 1000,
      folded: false,
      allIn: false,
      holeCards: ["As", "Kd"],
      status: "claimed" as const,
    };

    const status = (
      player: typeof playerBase & { readonly active?: boolean },
      latestAction: { action: string; amount: number | null } | null = null,
    ) =>
      describeSeatStatus(
        {
          leaving: player.leaving,
          inHand: player.inHand,
          folded: player.folded,
          allIn: player.allIn,
          stack: player.stack,
          active: player.active,
        },
        latestAction,
        enUsGame.seat,
        enUsGame.actions,
        "en-US",
      );

    expect(status({ ...playerBase, leaving: true })).toBe(
      "Leaving after this hand",
    );
    expect(status({ ...playerBase, inHand: false })).toBe(
      "Waiting for next hand",
    );
    expect(status({ ...playerBase, inHand: false, stack: 0 })).toBe("Busted");
    expect(status({ ...playerBase, folded: true })).toBe("Folded");
    expect(status({ ...playerBase, allIn: true })).toBe("All-in");
    expect(status({ ...playerBase, active: true })).toBe("Thinking");
    expect(status({ ...playerBase, active: false })).toBe("Waiting");
    expect(
      status({ ...playerBase, active: false }, { action: "call", amount: 900 }),
    ).toBe("Call 900");
    expect(
      status(
        { ...playerBase, active: false },
        { action: "raise", amount: 1800 },
      ),
    ).toBe("Raise 1,800");
    expect(
      describeSeatStatus(
        {
          leaving: false,
          inHand: true,
          folded: true,
          allIn: false,
          stack: 1000,
          active: false,
        },
        null,
        fiFiGame.seat,
        fiFiGame.actions,
        "fi-FI",
      ),
    ).toBe("Kipannut");
    expect(
      describeSeatStatus(
        {
          leaving: false,
          inHand: true,
          folded: false,
          allIn: false,
          stack: 1000,
          active: false,
        },
        { action: "raise", amount: 1800 },
        fiFiGame.seat,
        fiFiGame.actions,
        "fi-FI",
      ),
    ).toBe(`Korota ${formatChips(1800, "fi-FI")}`);
  });

  it("keeps terminal seat states ahead of the latest action", () => {
    const player = {
      leaving: false,
      inHand: true,
        committedStreet: 0,
      folded: true,
      allIn: false,
      stack: 1_000,
      active: false,
    };

    expect(
      describeSeatStatus(
        player,
        { action: "fold", amount: null },
        enUsGame.seat,
        enUsGame.actions,
        "en-US",
      ),
    ).toBe("Folded");
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
