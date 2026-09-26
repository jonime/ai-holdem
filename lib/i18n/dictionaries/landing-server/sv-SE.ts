import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Starta ett nytt spel",
  title: "AI Hold'em",
  intro: "Skapa ett bord och bjud in någon till en ledig plats.",
  newGame: "Nytt spel",
  resources: "Projektresurser",
  about: "Om projektet",
  developerResources: "Utvecklarresurser",
} satisfies LandingServerDictionary;

export default dictionary;
