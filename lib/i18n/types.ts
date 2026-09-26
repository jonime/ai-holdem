import type enMetadata from "./dictionaries/metadata/en-US";
import type enLandingServer from "./dictionaries/landing-server/en-US";
import type enLandingClient from "./dictionaries/landing-client/en-US";
import type enGame from "./dictionaries/game/en-US";

type DictionaryShape<Value> = Value extends string
  ? string
  : { readonly [Key in keyof Value]: DictionaryShape<Value[Key]> };

export type MetadataDictionary = DictionaryShape<typeof enMetadata>;
export type LandingServerDictionary = DictionaryShape<
  typeof enLandingServer
>;
export type LandingClientDictionary = DictionaryShape<typeof enLandingClient>;
export type GameDictionary = DictionaryShape<typeof enGame>;