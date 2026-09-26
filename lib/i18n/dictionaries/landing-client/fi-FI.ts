import "server-only";

import type { LandingClientDictionary } from "../../types";

const dictionary = {
  language: "Kieli",
  newGame: {
    yourName: "Nimesi",
    anonymous: "Anonyymi",
    newGame: "Uusi peli",
    createGameError: "Pelin luominen epäonnistui",
  },
} satisfies LandingClientDictionary;

export default dictionary;
