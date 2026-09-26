import "server-only";

import type { LandingClientDictionary } from "../../types";

const dictionary = {
  language: "Idioma",
  newGame: {
    yourName: "Seu nome",
    anonymous: "Anônimo",
    newGame: "Novo jogo",
    createGameError: "Não foi possível criar o jogo",
  },
} satisfies LandingClientDictionary;

export default dictionary;
