import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Spielart auswählen",
  title: "AI Hold'em",
  intro: "Spiele Texas Hold’em gegen KI-Bots, lade Freunde ein oder sieh Bots beim Spielen zu.",
  supportingCopy: "Starte sofort ein privates Spiel an einem Sechsertisch gegen fünf Bots oder passe deinen eigenen Tisch an.",
  quickPlay: "Schnellspiel gegen KI",
  customTable: "Eigenen Tisch erstellen",
  joinPublicTable: "Öffentlichem Tisch beitreten",
  resources: "Projektressourcen",
  about: "Über das Projekt",
  developerResources: "Entwicklerressourcen",
} satisfies LandingServerDictionary;

export default dictionary;
