import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Aloita uusi peli",
  title: "AI Hold'em",
  intro: "Luo pöytä ja kutsu joku avoimelle paikalle.",
  newGame: "Uusi peli",
  resources: "Projektin resurssit",
  about: "Tietoja",
  developerResources: "Kehittäjäresurssit",
} satisfies LandingServerDictionary;

export default dictionary;
