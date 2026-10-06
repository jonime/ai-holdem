import "server-only";
import directory from "../join-game/nl-NL";
const dictionary = {
  "title": "Spelen",
  "intro": "Keer terug naar je tafels of zoek een open openbare tafel.",
  "createTable": "Tafel maken",
  "yourTables": "Jouw tafels",
  "browserTables": "Deze tafels horen bij deze browser. Terugkeren garandeert niet dat er een nieuwe hand kan beginnen.",
  "recentlyActive": "Recent actief",
  "returnToTable": "Terug naar tafel",
  "personalError": "Je tafels konden niet worden geladen.",
  "retry": "Opnieuw proberen",
  "publicTables": "Open openbare tafels",
  "refreshAll": "Alle tafels vernieuwen",
  "refreshing": "Vernieuwen…",
  "loadingPersonal": "Je tafels laden…",
  "loadingPublic": "Openbare tafels laden…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "Wachten", "playing": "Aan het spelen", "complete": "Hand voltooid", "error": "Fout"}
} as const;
export default dictionary;
