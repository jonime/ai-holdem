import "server-only";
import directory from "../join-game/de-DE";
const dictionary = {
  "title": "Spielen",
  "intro": "Kehre zu deinen Tischen zurück oder finde einen offenen öffentlichen Tisch.",
  "createTable": "Tisch erstellen",
  "yourTables": "Deine Tische",
  "browserTables": "Diese Tische gehören zu diesem Browser. Eine Rückkehr garantiert keine weitere Hand.",
  "recentlyActive": "Zuletzt aktiv",
  "returnToTable": "Zum Tisch zurück",
  "personalError": "Deine Tische konnten nicht geladen werden.",
  "retry": "Erneut versuchen",
  "publicTables": "Offene öffentliche Tische",
  "refreshAll": "Alle Tische aktualisieren",
  "refreshing": "Aktualisierung…",
  "loadingPersonal": "Deine Tische werden geladen…",
  "loadingPublic": "Öffentliche Tische werden geladen…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "Wartend", "playing": "Im Spiel", "complete": "Hand beendet", "error": "Fehler"}
} as const;
export default dictionary;
