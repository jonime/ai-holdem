import "server-only";

import type { LandingClientDictionary } from "../../types";

const dictionary = {
  language: "Sprache",
  newGame: {
    yourName: "Dein Name",
    anonymous: "Anonym",
    newGame: "Neues Spiel",
    createGameError: "Spiel konnte nicht erstellt werden",
  },
} satisfies LandingClientDictionary;

export default dictionary;
