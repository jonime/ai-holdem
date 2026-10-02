import type {
  LegalAction,
  PokerStreet,
  PublicPokerPlayer,
} from "@/lib/poker/types";
import type {
  GameFeedEvent,
  LatestPlayerAction,
} from "@/components/poker/types";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import type { GameDictionary } from "@/lib/i18n/types";

export function formatChips(
  value: number,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale).format(value);
}

const shortSuitSymbols: Record<string, string> = {
  c: "♣",
  d: "♦",
  h: "♥",
  s: "♠",
};

export function shortCardLabel(card: string): string {
  const suit = card.at(-1) ?? "";
  const rank = card.slice(0, -1);
  return `${rank}${shortSuitSymbols[suit] ?? ""}`;
}

export function feedEventLabel(
  event: GameFeedEvent,
  locale: Locale,
  labels: GameDictionary["feed"],
): string {
  switch (event.type) {
    case "handStarted":
      return labels.hand.replace("{hand}", String(event.handNumber));
    case "street": {
      const street = labels[event.street];
      const cards = event.cards.map(shortCardLabel).join(" ");
      return cards ? `${street}  ${cards}` : street;
    }
    case "win":
      return (event.uncontested ? labels.winUncontested : labels.win)
        .replace("{player}", event.player)
        .replace("{amount}", formatChips(event.amount, locale));
    case "blind":
      return (event.blind === "small" ? labels.smallBlind : labels.bigBlind)
        .replace("{player}", event.player)
        .replace("{amount}", formatChips(event.amount, locale));
    case "action": {
      const amount =
        event.amount !== null ? formatChips(event.amount, locale) : "";
      const template =
        event.action === "all_in" ? labels.allIn : labels[event.action];
      return template
        .replace("{player}", event.player)
        .replace("{amount}", amount);
    }
  }
}

export function latestActionsForStreet(
  events: readonly GameFeedEvent[],
  players: readonly Pick<PublicPokerPlayer, "id" | "name">[],
  handNumber: number,
  street: PokerStreet | null,
): Readonly<Record<string, LatestPlayerAction>> {
  if (street === null || street === "complete") {
    return {};
  }

  const latestActions: Record<string, LatestPlayerAction> = {};
  for (const event of events) {
    if (
      event.type !== "action" ||
      event.handNumber !== handNumber ||
      event.street !== street
    ) {
      continue;
    }
    const player = players.find((candidate) => candidate.id === event.playerId);
    if (player) {
      latestActions[player.id] = {
        action: event.action,
        amount: event.amount,
      };
    }
  }
  return latestActions;
}

export function cardLabel(
  card: string,
  labels: GameDictionary["cards"],
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

export type LobbyGuidanceKey =
  | "invalidSettings"
  | "addPlayer"
  | "ready"
  | "readyToWatch"
  | "chooseSeat"
  | "waitingAsPlayer"
  | "waitingAsSpectator";

export function selectLobbyGuidance({
  players,
  viewerIsHost,
  viewerToken,
  settingsValid,
}: {
  readonly players: readonly Pick<
    PublicPokerPlayer,
    "playerToken" | "status"
  >[];
  readonly viewerIsHost: boolean;
  readonly viewerToken: string | null;
  readonly settingsValid: boolean;
}): LobbyGuidanceKey {
  const viewerIsSeated =
    viewerToken !== null &&
    players.some(
      (player) =>
        player.status === "claimed" && player.playerToken === viewerToken,
    );

  if (viewerIsHost) {
    if (!settingsValid) return "invalidSettings";
    if (filledSeatCount(players) < 2) return "addPlayer";
    return viewerIsSeated ? "ready" : "readyToWatch";
  }

  if (!viewerIsSeated && players.some((player) => player.status === "open")) {
    return "chooseSeat";
  }

  return viewerIsSeated ? "waitingAsPlayer" : "waitingAsSpectator";
}

export function inviteUrlFromLocation(
  location: Pick<Location, "origin" | "pathname">,
): string {
  const inviteUrl = new URL(location.pathname, location.origin);
  inviteUrl.username = "";
  inviteUrl.password = "";
  inviteUrl.search = "";
  inviteUrl.hash = "";
  return inviteUrl.href;
}

export async function copyInviteUrl(
  clipboard: Pick<Clipboard, "writeText"> | undefined,
  inviteUrl: string,
): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(inviteUrl);
    return true;
  } catch {
    return false;
  }
}

export function describeHandResult(
  winnerNames: readonly string[] | null | undefined,
  labels: GameDictionary["history"],
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

export function describeBotConfiguration(
  player: Pick<
    PublicPokerPlayer,
    "controller" | "bot" | "aiDifficulty" | "botProfileId"
  >,
  seatLabels: GameDictionary["seat"],
  lobbyLabels: GameDictionary["lobby"],
): string | null {
  if (player.controller !== "bot") {
    return null;
  }

  const supportsDifficulty =
    player.bot?.configuration?.difficulty ?? player.bot?.provider !== "llm";
  const supportsPlaystyle =
    player.bot?.configuration?.playstyle ?? player.bot?.provider === "llm";
  const details: string[] = [];
  if (supportsDifficulty && player.aiDifficulty) {
    details.push(
      seatLabels.botDifficulty.replace(
        "{value}",
        lobbyLabels[player.aiDifficulty],
      ),
    );
  }
  if (supportsPlaystyle && player.botProfileId) {
    details.push(
      seatLabels.botPlaystyle.replace(
        "{value}",
        lobbyLabels[player.botProfileId],
      ),
    );
  }

  return details.length > 0 ? details.join(" · ") : null;
}

export function describeSeatStatus(
  player: Pick<
    PublicPokerPlayer,
    "leaving" | "inHand" | "folded" | "allIn" | "stack"
  > & {
    readonly active?: boolean;
  },
  latestAction: LatestPlayerAction | null,
  labels: GameDictionary["seat"],
  actions: GameDictionary["actions"],
  locale: Locale,
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
  locale: Locale,
  labels: GameDictionary["actions"],
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

/** Public stacks are settled only after completion; an active all-in can recover. */
export function tableFlow(
  players: readonly PublicPokerPlayer[],
  street: PokerStreet | null,
  viewerToken: string | null,
  viewerIsHost: boolean,
) {
  const { human } = resolveViewer(players, viewerToken);
  const winnerId = findGameWinnerId(players, street);
  const eliminated = human !== null && (
    (human.stack === 0 && (street === "complete" || !human.inHand)) ||
    (human.status !== "claimed" && !human.inHand)
  );
  const participants = players.filter(p => p.status === "claimed" || p.status === "bot");
  const botOnly = participants.length > 0 && participants.every(p => p.controller === "bot");
  const canStartNextHand = street === "complete" && winnerId === null &&
    participants.filter(p => p.stack > 0 && !p.leaving).length >= 2 &&
    (human !== null || (botOnly && viewerIsHost));
  return { winnerId, eliminated, canStartNextHand,
    watching: street !== "complete" && (human === null || eliminated || !human.inHand) };
}
