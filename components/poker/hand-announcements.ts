import type { Game } from "./types";
import type { GameTranslator } from "@/lib/i18n/types";
import { formatChips } from "./view-model";
import { notificationEligible } from "./turn-notifications";
import type { Locale } from "@/lib/i18n";

/** Version is deliberately absent: a decision is the authoritative actor and betting context. */
export function decisionIdentity(game: Game): string {
  return JSON.stringify([game.id, game.poker.handNumber, game.poker.street,
    game.poker.currentActorId, game.turnTimer?.decisionId,
    game.poker.pot, game.poker.legalActions,
    game.poker.players.map(p => [p.id, p.committedStreet, p.stack, p.folded, p.allIn])]);
}

export function handAnnouncement(game: Game, token: string | null, blocked: boolean,
  online: boolean, remaining: number | null, t: GameTranslator, locale: Locale) {
  const chips = (amount: number) => formatChips(amount, locale);
  if (game.poker.street === "complete") {
    const poker = game.poker;
    const awards = poker.winnerIds.flatMap(id => {
      const player = poker.players.find(p => p.id === id);
      const amount = poker.winnerAmounts[id];
      return player && amount !== undefined ? [t("result.award", { player: player.name, amount: chips(amount) })] : [];
    });
    const personal = poker.viewerHandResult;
    if (personal) awards.push(t(personal.netChange > 0 ? "result.gained" : personal.netChange < 0 ? "result.lost" : "result.brokeEven", { amount: chips(Math.abs(personal.netChange)) }));
    return { identity: `${game.id}:${poker.handNumber}:complete`, text: `${t("table.complete")}. ${awards.join(". ")}` };
  }
  if (!notificationEligible(game, token, blocked, online, remaining)) return null;
  const call = game.poker.legalActions.find(a => a.type === "call");
  const availability = call?.type === "call" ? t("table.call", { amount: chips(call.amount) }) : t("accessibility.checkAvailable");
  const actions = game.poker.legalActions.map(a => t(`actions.${a.type}`)).join(", ");
  return { identity: decisionIdentity(game), text: t("accessibility.turn", { pot: chips(game.poker.pot), availability, actions }) };
}

export function createHandAnnouncer() {
  let seen: string | null = null;
  let barrier = -1;
  return {
    observe(revision: number, suppressed: boolean, message: { identity: string; text: string } | null) {
      if (suppressed) { barrier = revision; return ""; }
      if (revision <= barrier || !message) return "";
      if (seen === message.identity) return "";
      seen = message.identity;
      return message.text;
    },
  };
}
