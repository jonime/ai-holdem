import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Starta ett nytt spel",
  title: "AI Hold'em",
  intro: "Spela Texas Hold’em mot AI-botar, bjud in vänner eller se botar spela.",
  supportingCopy: "Skapa ett bord, välj vilka som spelar och starta sedan given.",
  newGame: "Nytt spel",
  resources: "Projektresurser",
  about: "Om projektet",
  developerResources: "Utvecklarresurser",
} satisfies LandingServerDictionary;

export default dictionary;
