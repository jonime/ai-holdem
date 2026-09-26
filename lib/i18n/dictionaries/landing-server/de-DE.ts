import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Neues Spiel starten",
  title: "AI Hold'em",
  intro: "Erstelle einen Tisch und lade jemanden auf einen freien Platz ein.",
  newGame: "Neues Spiel",
  resources: "Projektressourcen",
  about: "Über das Projekt",
  developerResources: "Entwicklerressourcen",
} satisfies LandingServerDictionary;

export default dictionary;
