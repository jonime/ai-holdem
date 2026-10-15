import type { PublicPokerPlayer } from "./types";
import type { GameDictionary } from "@/lib/i18n/types";
import { describeBotConfiguration } from "./view-model";

/** Resolve by immutable participant ID, including when display names collide. */
export function selectedBot(players: readonly PublicPokerPlayer[], id: string) {
  return players.find(player => player.id === id && player.controller === "bot" && player.status !== "open") ?? null;
}

export function botInformation(player: PublicPokerPlayer, dictionary: GameDictionary) {
  const copy = dictionary.botInformation;
  const provider = player.bot?.provider;
  const difficulty = player.bot?.configuration?.difficulty ?? provider !== "llm";
  const playstyle = player.bot?.configuration?.playstyle ?? provider === "llm";
  const notes: string[] = [];
  if (difficulty && player.aiDifficulty && provider) {
    if (provider === "rules") notes.push(copy.rulesDifficulty[player.aiDifficulty]);
    else if (provider === "typesafe" || provider === "eevo") {
      notes.push(player.aiDifficulty === "easy" ? copy.sampled : copy.preferred);
    }
  }
  if (playstyle && player.botProfileId && provider === "llm") notes.push(copy.playstyles[player.botProfileId]);
  return {
    label: player.bot?.label ?? copy.genericLabel,
    description: provider ? copy.providers[provider] : copy.genericDescription,
    configuration: describeBotConfiguration(player, dictionary.seat, dictionary.lobby),
    notes,
  };
}
