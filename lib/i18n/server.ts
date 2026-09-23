import "server-only";

import type { Locale } from "./index";
import enUsDictionary, { type Dictionary } from "./dictionaries/en-US";
import fiFiDictionary from "./dictionaries/fi-FI";

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  switch (locale) {
    case "en-US":
      return enUsDictionary;
    case "fi-FI":
      return fiFiDictionary;
  }
}
