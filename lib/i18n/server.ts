import "server-only";

import type { Locale } from "./index";
import enUsDictionary, { type Dictionary } from "./dictionaries/en-US";
import fiFiDictionary from "./dictionaries/fi-FI";
import esEsDictionary from "./dictionaries/es-ES";
import deDeDictionary from "./dictionaries/de-DE";
import svSeDictionary from "./dictionaries/sv-SE";

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
  }
}
