import "server-only";

import type { Locale } from "./index";
import enUsDictionary, { type Dictionary } from "./dictionaries/en-US";
import fiFiDictionary from "./dictionaries/fi-FI";
import esEsDictionary from "./dictionaries/es-ES";
import deDeDictionary from "./dictionaries/de-DE";
import svSeDictionary from "./dictionaries/sv-SE";
import frFrDictionary from "./dictionaries/fr-FR";
import ptBrDictionary from "./dictionaries/pt-BR";
import itItDictionary from "./dictionaries/it-IT";
import nlNlDictionary from "./dictionaries/nl-NL";
import plPlDictionary from "./dictionaries/pl-PL";

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  switch (locale) {
    case "en-US":
      return enUsDictionary;
    case "fi-FI":
      return fiFiDictionary;
    case "es-ES":
      return esEsDictionary;
    case "de-DE":
      return deDeDictionary;
    case "sv-SE":
      return svSeDictionary;
    case "fr-FR":
      return frFrDictionary;
    case "pt-BR":
      return ptBrDictionary;
    case "it-IT":
      return itItDictionary;
    case "nl-NL":
      return nlNlDictionary;
    case "pl-PL":
      return plPlDictionary;
  }
}
