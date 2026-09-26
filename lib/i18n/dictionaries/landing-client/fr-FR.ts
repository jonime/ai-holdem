import "server-only";

import type { LandingClientDictionary } from "../../types";

const dictionary = {
  language: "Langue",
  newGame: {
    yourName: "Votre nom",
    anonymous: "Anonyme",
    newGame: "Nouvelle partie",
    createGameError: "Impossible de créer la partie",
  },
} satisfies LandingClientDictionary;

export default dictionary;
