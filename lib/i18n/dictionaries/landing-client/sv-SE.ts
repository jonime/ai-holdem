import "server-only";

import type { LandingClientDictionary } from "../../types";

const dictionary = {
  language: "Språk",
  newGame: {
    yourName: "Ditt namn",
    anonymous: "Anonym",
    newGame: "Nytt spel",
    createGameError: "Det gick inte att skapa spelet",
  },
} satisfies LandingClientDictionary;

export default dictionary;
