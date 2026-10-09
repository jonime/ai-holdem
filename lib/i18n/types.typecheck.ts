// Compile-only assertions, included by the normal TypeScript check.
import type { GameTranslator } from "./types";
import type { AIDifficulty, BotPlaystyleId, PokerStreet } from "@/lib/poker/types";
import type { LobbyGuidanceKey } from "@/components/poker/view-model";

export function assertTranslationKeys(
  t: GameTranslator,
  street: PokerStreet,
  difficulty: AIDifficulty,
  playstyle: BotPlaystyleId,
  guidance: LobbyGuidanceKey,
  unrestricted: string,
) {
  t("table.hand", { hand: 3 });
  t("lobby.invitation.copyInviteLink");
  t(`table.${street}`);
  t(`lobby.${difficulty}`);
  t(`lobby.${playstyle}`);
  t(`lobby.guidance.${guidance}`);
  // @ts-expect-error Misspelled leaves must fail.
  t("table.hnad");
  // @ts-expect-error Top-level sections are not string leaves.
  t("table");
  // @ts-expect-error Nested sections are not string leaves either.
  t("lobby.guidance");
  // @ts-expect-error Unknown dotted paths must fail.
  t("unknown.hand");
  // @ts-expect-error Unrestricted strings cannot reach the public translator.
  t(unrestricted);
}
