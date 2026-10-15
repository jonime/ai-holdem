import { describe, expect, it } from "vitest";
import dictionary from "@/lib/i18n/dictionaries/game/en-US";
import { gameplayGame } from "@/test/fixtures/gameplay";
import type { PublicPokerPlayer } from "./types";
import { botInformation, selectedBot } from "./bot-information";

const bot: PublicPokerPlayer = { ...gameplayGame.poker.players[1], controller: "bot", status: "bot", aiDifficulty: "medium", botProfileId: null };
const copy = dictionary.botInformation;
function player(provider: NonNullable<PublicPokerPlayer["bot"]>["provider"], patch: Partial<PublicPokerPlayer> = {}): PublicPokerPlayer {
  return { ...bot, bot: { id: "old-bot", provider, label: "Stored label", modelId: null }, ...patch };
}
describe("bot information from public participant metadata", () => {
  it.each(["rules", "typesafe", "eevo", "llm"] as const)("selects the %s explanation without interpreting the label", provider => {
    const info = botInformation(player(provider, { name: "Identical", aiDifficulty: null }), dictionary);
    expect(info.description).toBe(copy.providers[provider]);
    expect(info.label).toBe("Stored label");
    expect(info.configuration).toBeNull();
    expect(info.notes).toEqual([]);
  });
  it.each(["easy", "medium", "hard"] as const)("describes Rules %s", aiDifficulty => {
    const info = botInformation(player("rules", { aiDifficulty }), dictionary);
    expect(info.notes).toEqual([copy.rulesDifficulty[aiDifficulty]]);
    expect(info.configuration).toContain(dictionary.lobby[aiDifficulty]);
  });
  it.each(["typesafe", "eevo"] as const)("keeps %s Medium and Hard selection identical", provider => {
    expect(botInformation(player(provider, { aiDifficulty: "easy" }), dictionary).notes).toEqual([copy.sampled]);
    for (const aiDifficulty of ["medium", "hard"] as const) {
      expect(botInformation(player(provider, { aiDifficulty }), dictionary).notes).toEqual([copy.preferred]);
    }
  });
  it.each(["balanced", "tight", "aggressive"] as const)("uses the stored LLM %s playstyle", botProfileId => {
    const info = botInformation(player("llm", { botProfileId }), dictionary);
    expect(info.notes).toEqual([copy.playstyles[botProfileId]]);
    expect(info.configuration).toBe(`Playstyle: ${dictionary.lobby[botProfileId]}`);
  });
  it("honors explicit capability flags and missing values", () => {
    for (const provider of ["rules", "typesafe", "eevo", "llm"] as const) {
      const base = player(provider, { botProfileId: "aggressive" });
      const p = { ...base, bot: { ...base.bot!, configuration: { difficulty: false, playstyle: false } } };
      const info = botInformation(p, dictionary);
      expect(info.configuration).toBeNull(); expect(info.notes).toEqual([]);
      const missing = botInformation({ ...p, aiDifficulty: null, botProfileId: null,
        bot: { ...p.bot, configuration: { difficulty: true, playstyle: true } } }, dictionary);
      expect(missing.configuration).toBeNull(); expect(missing.notes).toEqual([]);
    }
  });
  it("keeps legacy fallbacks without inferring the provider from a name", () => {
    const info = botInformation({ ...bot, bot: null, name: "TypeSafe Jev", botProfileId: "tight", aiDifficulty: "hard" }, dictionary);
    expect(info.label).toBe(copy.genericLabel);
    expect(info.description).toBe(copy.genericDescription);
    expect(info.configuration).toBe("Difficulty: Hard");
    expect(info.notes).toEqual([]);
  });
  it("selects immutable IDs despite identical names or changed seat numbers", () => {
    const a = { ...player("rules"), id: "a", name: "Same", seat: 1 };
    const b = { ...player("llm", { botProfileId: "tight" }), id: "b", name: "Same", seat: 2 };
    expect(selectedBot([a, b], "b")).toBe(b);
    const moved = { ...b, name: "Renamed", seat: 4 };
    expect(selectedBot([a, moved], "b")).toBe(moved);
    expect(selectedBot([a], "b")).toBeNull();
    expect(selectedBot([{ ...b, controller: "human" }], "b")).toBeNull();
    expect(selectedBot([{ ...b, status: "open" }], "b")).toBeNull();
  });
});
