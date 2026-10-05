import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Spielart auswählen",
  title: "AI Hold'em",
  intro: "Spiele Texas Hold’em gegen KI-Bots, lade Freunde ein oder sieh Bots beim Spielen zu.",
  supportingCopy: "Starte sofort ein privates Spiel an einem Sechsertisch gegen fünf Bots oder passe deinen eigenen Tisch an.",
  quickPlay: "Schnellspiel gegen KI",
  customTable: "Eigenen Tisch erstellen",
  joinPublicTable: "Öffentlichem Tisch beitreten",
  resources: "Projektressourcen",
  about: "Über das Projekt",
  developerResources: "Entwicklerressourcen",
  content: {
    play: {
      title: "Spiele Texas Hold’em gegen KI-Gegner",
      intro: "AI Hold’em ist ein kostenloses Texas-Hold’em-Spiel, das direkt im Browser läuft. Du spielst gegen Pokerspieler, die von KI gesteuert werden. Öffne die Seite und wähle Schnellspiel, um sofort eine private Partie mit sechs Plätzen gegen fünf Bots zu starten. Du brauchst weder einen Download noch ein Benutzerkonto. Gespielt wird mit virtuellen Chips, ohne Einsätze um echtes Geld oder Geldpreise.",
      tables: "Für eine andere Besetzung kannst du einen eigenen Tisch mit zwei bis sechs Plätzen erstellen und den Link mit Freunden teilen. Menschen und Pokerbots können am selben Tisch spielen. Du kannst auch alle Plätze mit Bots besetzen und zusehen, wie sich eine Hand entwickelt. Ob du allein gegen Bots spielst oder Freunde einlädst: Karten, Setzrunden und Pots folgen den Regeln von No-Limit Texas Hold’em.",
    },
    bots: {
      title: "Verschiedene Pokerbots, verschiedene Strategien",
      description: "AI Hold’em unterstützt Equity Rules, einen regelbasierten Bot mit berechneter Equity und Pot Odds, TypeSafe Jev, der Spielzüge über TypeSafe System One auswählt, sowie konfigurierte LLM-Pokerbots. Welche Gegner verfügbar sind, hängt von der Konfiguration der Website ab. Verschiedene Agenten können unterschiedliche Entscheidungen treffen. LLM-Bots nutzen einen ausgewogenen, tighten oder aggressiven Spielstil als Orientierung.",
      aboutLink: "Mehr über die Bots und die Funktionsweise von AI Hold’em",
    },
    faq: {
      title: "Häufige Fragen zu AI Hold’em",
      items: {
        free: {
          question: "Ist AI Hold’em kostenlos?",
          answer: "Ja. Du kannst kostenlos im Browser spielen, ohne dich zu registrieren.",
        },
        ai: {
          question: "Kann ich Texas Hold’em gegen KI spielen?",
          answer: "Ja. Schnellspiel startet eine private Texas-Hold’em-Partie gegen fünf KI-Pokerbots.",
        },
        friends: {
          question: "Kann ich mit Freunden spielen?",
          answer: "Ja. Erstelle einen eigenen Tisch und teile den Link, damit Freunde einen freien Platz belegen können. Tische bieten zwei bis sechs Plätze, einschließlich Bots.",
        },
        money: {
          question: "Wird bei AI Hold’em um echtes Geld gespielt?",
          answer: "Nein. Gespielt wird mit virtuellen Chips, ohne Echtgeld-Einsätze oder Geldpreise.",
        }
      }
    }
  },
} satisfies LandingServerDictionary;

export default dictionary;
