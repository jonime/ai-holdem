import type enMetadata from "./dictionaries/metadata/en-US";
import type enLandingServer from "./dictionaries/landing-server/en-US";
import type enGame from "./dictionaries/game/en-US";
import type enJoinGame from "./dictionaries/join-game/en-US";

type DictionaryShape<Value> = Value extends string
  ? string
  : { readonly [Key in keyof Value]: DictionaryShape<Value[Key]> };

export type MetadataDictionary = DictionaryShape<typeof enMetadata>;
export type LandingServerDictionary = DictionaryShape<
  typeof enLandingServer
>;
export type GameDictionary = DictionaryShape<typeof enGame>;
export type JoinGameDictionary = DictionaryShape<typeof enJoinGame>;

import type enPlay from "./dictionaries/play/en-US";
export type PlayDictionary = DictionaryShape<typeof enPlay>;

/** Dotted paths to string leaves only; dictionary sections are not keys. */
type StringLeafPaths<Value> = {
  [Key in keyof Value & string]: Value[Key] extends string
    ? Key
    : Value[Key] extends object
      ? `${Key}.${StringLeafPaths<Value[Key]>}`
      : never;
}[keyof Value & string];

export type GameTranslationKey = StringLeafPaths<GameDictionary>;
export type TranslationValues = Readonly<Record<string, string | number>>;
export type GameTranslator = (
  key: GameTranslationKey,
  values?: TranslationValues,
) => string;
