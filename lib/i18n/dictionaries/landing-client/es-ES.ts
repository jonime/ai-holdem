import "server-only";

import type { LandingClientDictionary } from "../../types";

const dictionary = {
  language: "Idioma",
  newGame: {
    yourName: "Tu nombre",
    anonymous: "Anónimo",
    newGame: "Partida nueva",
    createGameError: "No se pudo crear la partida",
  },
} satisfies LandingClientDictionary;

export default dictionary;
