import "server-only";

import type { LandingClientDictionary } from "../../types";

const dictionary = {
  language: "Taal",
  newGame: {
    yourName: "Je naam",
    anonymous: "Anoniem",
    newGame: "Nieuw spel",
    createGameError: "Spel kon niet worden gemaakt",
  },
} satisfies LandingClientDictionary;

export default dictionary;
