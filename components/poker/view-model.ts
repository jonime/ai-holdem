import type { LegalAction, PublicPokerPlayer } from "@/lib/poker/types";
import type { LatestPlayerAction } from "@/components/poker/types";

export function formatChips(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function cardLabel(card: string): string {
  const suit = card.at(-1) ?? "";
  const rank = card.slice(0, -1);
  const suits: Record<string, string> = {
    c: "clubs",
    d: "diamonds",
    h: "hearts",
    s: "spades",
  };
  return `${rank} of ${suits[suit] ?? "unknown suit"}`;
}

export function arrangeSeats(
  players: readonly PublicPokerPlayer[],
  anchorId: string | null,
): {
  readonly top: readonly PublicPokerPlayer[];
  readonly bottom: readonly PublicPokerPlayer[];
} {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const anchorIndex = ordered.findIndex((player) => player.id === anchorId);
  const rotated =
    anchorIndex > 0
      ? [...ordered.slice(anchorIndex), ...ordered.slice(0, anchorIndex)]
      : ordered;

  if (rotated.length >= 5) {
    return {
      bottom: [rotated[rotated.length - 1], rotated[0], rotated[1]],
      top: rotated.slice(2, rotated.length - 1).reverse(),
    };
  }

  return { bottom: rotated.slice(0, 1), top: rotated.slice(1).reverse() };
}

export function parseProbabilities(
  value: unknown,
): Readonly<Record<string, number>> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const entries = Object.entries(value).flatMap(([key, entry]) => {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      return [[key, entry]] as Array<[string, number]>;
    }
    return [];
  });

  return Object.fromEntries(entries);
}

export function resolveViewer(
  players: readonly PublicPokerPlayer[],
  viewerToken: string | null,
) {
  const viewerPlayer =
    players.find(
      (player) =>
        player.playerToken !== null && player.playerToken === viewerToken,
    ) ?? null;

  const human =
    viewerPlayer && viewerPlayer.controller === "human"
      ? viewerPlayer
      : (players.find((player) => player.controller === "human") ?? null);

  return { viewerPlayer, human };
}

export function canManageTable(
  players: readonly Pick<PublicPokerPlayer, "isHost" | "playerToken">[],
  viewerToken: string | null,
): boolean {
  return (
    !players.some((player) => player.isHost) ||
    players.some(
      (player) => player.isHost && player.playerToken === viewerToken,
    )
  );
}

export function filledSeatCount(
  players: readonly Pick<PublicPokerPlayer, "status">[],
): number {
  return players.filter(
    (player) => player.status === "claimed" || player.status === "bot",
  ).length;
}

export function describeHandResult(
  winnerNames: readonly string[] | null | undefined,
): string | null {
  if (!winnerNames || winnerNames.length === 0) {
    return "Hand complete";
  }
  if (winnerNames.length > 1) {
    return `Split pot: ${winnerNames.join(" & ")}`;
  }
  return `Winner: ${winnerNames[0]}`;
}

export function describeSeatStatus(
  player: Pick<PublicPokerPlayer, "leaving" | "inHand" | "folded" | "allIn"> & {
    readonly active?: boolean;
  },
  latestAction: LatestPlayerAction | null = null,
): string {
  if (player.leaving) {
    return "Leaving after this hand";
  }
  if (!player.inHand) {
    return "Waiting for next hand";
  }
  if (player.folded) {
    return "Folded";
  }
  if (player.allIn) {
    return "All-in";
  }
  if (player.active) {
    return "Thinking";
  }
  return latestAction ? formatActionLabel(latestAction) : "Waiting";
}

export function formatActionLabel(action: LatestPlayerAction): string {
  const label = action.action[0].toUpperCase() + action.action.slice(1);
  return action.amount === null
    ? label
    : `${label} ${formatChips(action.amount)}`;
}

export function availableHistoryHands(handNumber: number): number[] {
  return Array.from({ length: handNumber }, (_, index) => index + 1);
}

export function getSizedAction(
  legalActions: readonly LegalAction[],
): LegalAction | undefined {
  return legalActions.find(
    (action): action is LegalAction =>
      action.type === "bet" || action.type === "raise",
  );
}
