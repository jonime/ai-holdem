import type {
  LegalAction,
  PokerStreet,
  PublicPokerPlayer,
} from "@/lib/poker/types";
import type { LatestPlayerAction } from "@/components/poker/types";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import dictionary, { type Dictionary } from "@/lib/i18n/dictionaries/en-US";

export function formatChips(
  value: number,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function cardLabel(
  card: string,
  labels: Dictionary["cards"] = dictionary.cards,
): string {
  const suit = card.at(-1) ?? "";
  const rank = card.slice(0, -1);
  const suits: Record<string, string> = {
    c: labels.clubs,
    d: labels.diamonds,
    h: labels.hearts,
    s: labels.spades,
  };
  return labels.of
    .replace("{rank}", rank)
    .replace("{suit}", suits[suit] ?? labels.unknownSuit);
}

function rotateSeats(
  players: readonly PublicPokerPlayer[],
  anchorId: string | null,
): readonly PublicPokerPlayer[] {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const anchorIndex = ordered.findIndex((player) => player.id === anchorId);
  return anchorIndex > 0
    ? [...ordered.slice(anchorIndex), ...ordered.slice(0, anchorIndex)]
    : ordered;
}

export function arrangeSeats(
  players: readonly PublicPokerPlayer[],
  anchorId: string | null,
): {
  readonly top: readonly PublicPokerPlayer[];
  readonly bottom: readonly PublicPokerPlayer[];
} {
  const rotated = rotateSeats(players, anchorId);

  if (rotated.length >= 5) {
    return {
      bottom: [rotated[rotated.length - 1], rotated[0], rotated[1]],
      top: rotated.slice(2, rotated.length - 1).reverse(),
    };
  }

  return { bottom: rotated.slice(0, 1), top: rotated.slice(1).reverse() };
}

/**
 * Seat order for compact/mobile layouts: a single sequential list starting
 * at the anchor (typically the viewer) and walking the table in seat order,
 * so reading top-to-bottom matches turn order instead of the oval layout's
 * split top/bottom rows.
 */
export function arrangeSeatsLinear(
  players: readonly PublicPokerPlayer[],
  anchorId: string | null,
): readonly PublicPokerPlayer[] {
  return rotateSeats(players, anchorId);
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

  const human = viewerPlayer?.controller === "human" ? viewerPlayer : null;

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
  labels: Dictionary["history"] = dictionary.history,
): string | null {
  if (!winnerNames || winnerNames.length === 0) {
    return labels.handComplete;
  }
  if (winnerNames.length > 1) {
    return labels.splitPot.replace("{winners}", winnerNames.join(" & "));
  }
  return labels.winner.replace("{winner}", winnerNames[0]);
}

export function findGameWinnerId(
  players: readonly Pick<PublicPokerPlayer, "id" | "stack" | "status">[],
  street: PokerStreet | null,
): string | null {
  if (street !== "complete") {
    return null;
  }

  const remainingPlayers = players.filter(
    (player) =>
      (player.status === "claimed" || player.status === "bot") &&
      player.stack > 0,
  );
  return remainingPlayers.length === 1 ? remainingPlayers[0].id : null;
}

export function describeSeatStatus(
  player: Pick<
    PublicPokerPlayer,
    "leaving" | "inHand" | "folded" | "allIn" | "stack"
  > & {
    readonly active?: boolean;
  },
  latestAction: LatestPlayerAction | null = null,
  labels: Dictionary["seat"] = dictionary.seat,
  actions: Dictionary["actions"] = dictionary.actions,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (player.leaving) {
    return labels.leaving;
  }
  if (player.stack === 0 && !player.inHand) {
    return labels.busted;
  }
  if (!player.inHand) {
    return labels.waitingNextHand;
  }
  if (player.folded) {
    return labels.folded;
  }
  if (player.allIn) {
    return labels.allIn;
  }
  if (player.active) {
    return labels.thinking;
  }
  return latestAction
    ? formatActionLabel(latestAction, locale, actions)
    : labels.waiting;
}

export function formatActionLabel(
  action: LatestPlayerAction,
  locale: Locale = DEFAULT_LOCALE,
  labels: Dictionary["actions"] = dictionary.actions,
): string {
  const label = labels[action.action as keyof typeof labels] ?? action.action;
  return action.amount === null
    ? label
    : `${label} ${formatChips(action.amount, locale)}`;
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
