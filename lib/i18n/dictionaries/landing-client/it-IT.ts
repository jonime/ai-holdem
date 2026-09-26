import "server-only";

import type { LandingClientDictionary } from "../../types";

const dictionary = {
  language: "Lingua",
  newGame: {
    yourName: "Il tuo nome",
    anonymous: "Anonimo",
    newGame: "Nuova partita",
    createGameError: "Impossibile creare la partita",
  },
} satisfies LandingClientDictionary;

export default dictionary;
