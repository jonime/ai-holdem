import "server-only";
import directory from "../join-game/sv-SE";
const dictionary = {
  "title": "Spela",
  "intro": "Återvänd till dina bord eller hitta ett öppet offentligt bord.",
  "createTable": "Skapa bord",
  "yourTables": "Dina bord",
  "browserTables": "Dessa bord tillhör den här webbläsaren. Att återvända garanterar inte att en ny hand kan börja.",
  "recentlyActive": "Senast aktiva",
  "returnToTable": "Tillbaka till bordet",
  "personalError": "Dina bord kunde inte laddas.",
  "retry": "Försök igen",
  "publicTables": "Öppna offentliga bord",
  "refreshAll": "Uppdatera alla bord",
  "refreshing": "Uppdaterar…",
  "loadingPersonal": "Laddar dina bord…",
  "loadingPublic": "Laddar offentliga bord…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "Väntar", "playing": "Spelar", "complete": "Handen avslutad", "error": "Fel"}
} as const;
export default dictionary;
