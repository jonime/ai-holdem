import "server-only";

import type { Locale } from "./index";
import dictionary, { type Dictionary } from "./dictionaries/en-US";

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  if (locale !== "en-US") throw new Error(`Unsupported locale: ${locale}`);
  return dictionary;
}
