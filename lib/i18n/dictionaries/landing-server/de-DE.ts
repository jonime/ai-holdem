import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Neues Spiel starten",
  title: "AI Hold'em",
  intro: "Erstelle einen Tisch und lade jemanden auf einen freien Platz ein.",
  overviewHeading: "Spiele Texas Hold'em mit Menschen und KI",
  overviewIntro: "AI Hold'em ist eine browserbasierte Poker-Demo für zwei bis sechs Plätze. Erstelle einen privaten Tisch-Link, lade andere Personen ein, setze anbieterbasierte oder deterministische Bots auf freie Plätze und konfiguriere Blinds, Startstacks und Bot-Schwierigkeit vor der ersten Hand.",
  engineHeading: "Regeln werden von der Poker-Engine durchgesetzt",
  engineLinkLabel: "Poker-Engine",
  engineBody: "Die Poker-Engine entscheidet verbindlich über Karten, Zugfolge, erlaubte Aktionen, Einsätze, Pots und Gewinner. Jeder Vorschlag von Menschen oder KI wird geprüft, bevor er das Spiel verändert. Der Tisch bietet Live-Aktualisierungen, Aktions- und Handverlauf, Kartenaufdeckung und weitere Hände.",
  privacyHeading: "Nachvollziehbare KI, geschützte Karten",
  privacyBody: "Wähle TypeSafe System One, konfigurierte OpenRouter-Modelle oder den deterministischen Equity-Rules-Bot. Aktive private Karten, Anbieter-Prompts und rohe Modellantworten bleiben vor Zuschauern verborgen. AI Hold'em ist eine technische Open-Source-Demo und kein Echtgeld-Glücksspielangebot.",
  resources: "Projektressourcen",
  sourceBeforeGitHub: "Den Quellcode findest du auf ",
  attributionAfterGitHub: ".",
  developerResources: "Entwicklerressourcen",
} satisfies LandingServerDictionary;

export default dictionary;
