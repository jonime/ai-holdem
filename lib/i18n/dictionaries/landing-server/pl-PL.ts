import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Rozpocznij nową grę",
  title: "AI Hold'em",
  intro: "Utwórz stół i zaproś kogoś do zajęcia wolnego miejsca.",
  overviewHeading: "Graj w Texas Hold'em z ludźmi i AI",
  overviewIntro: "AI Hold'em to działająca w przeglądarce demonstracja pokera dla dwóch do sześciu miejsc. Utwórz prywatny link do stołu, zaproś innych, przypisz boty dostawców lub boty deterministyczne do wolnych miejsc oraz ustaw blindy, stosy początkowe i poziom trudności przed pierwszym rozdaniem.",
  engineHeading: "Zasady egzekwowane przez silnik pokera",
  engineLinkLabel: "Silnik pokera",
  engineBody: "Silnik pokera rozstrzyga o kartach, kolejności tur, legalnych akcjach, zakładach, pulach i zwycięzcach. Każda propozycja człowieka lub AI jest sprawdzana przed zmianą gry. Stół oferuje aktualizacje na żywo, historię akcji i rozdań, odkrywanie kart oraz kolejne rozdania.",
  privacyHeading: "Przejrzysta AI i chronione karty",
  privacyBody: "Wybierz TypeSafe System One, skonfigurowane modele OpenRouter albo deterministycznego bota Equity Rules. Aktywne karty prywatne, zapytania do dostawców i surowe odpowiedzi modeli są ukryte przed widzami. AI Hold'em to techniczna demonstracja open source, a nie usługa hazardowa na prawdziwe pieniądze.",
  resources: "Zasoby projektu",
  sourceBeforeGitHub: "Zobacz kod źródłowy w serwisie ",
  attributionAfterGitHub: ".",
  developerResources: "Materiały dla programistów",
} satisfies LandingServerDictionary;

export default dictionary;
