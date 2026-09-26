import "server-only";

import type { LandingClientDictionary } from "../../types";

const dictionary = {
  language: "Język",
  newGame: {
    yourName: "Twoje imię",
    anonymous: "Anonimowy",
    newGame: "Nowa gra",
    createGameError: "Nie udało się utworzyć gry",
  },
} satisfies LandingClientDictionary;

export default dictionary;
