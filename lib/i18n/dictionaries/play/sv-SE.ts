import "server-only";
import directory from "../join-game/sv-SE";
const dictionary = {
  "title": "Spela",
  "intro": "Återvänd till dina bord eller hitta ett öppet offentligt bord.",
  "quickPlay": "Snabbspel mot AI",
  "createTable": "Skapa bord",
  deleteTable: "Radera bord",
  leaveAndRemove: "Lämna och ta bort",
  deleteBlocked: "Andra människor har fortfarande upptagna platser. Platserna måste frigöras innan bordet kan raderas.",
  confirmDelete: "Radera ”{title}”? Historiken och den delade länken tas bort permanent.",
  confirmLeave: "Lämna och ta bort ”{title}”? Det går inte att ångra under en hand. Väntande eller avslutade platser frigörs direkt; aktiva spelare lägger sig på nästa tillåtna tur. All-in-spelare behåller rätten till potten.",
  removalConflict: "Bordet ändrades. Granska den uppdaterade listan och försök igen.",
  removalFailed: "Bordet kunde inte tas bort. Försök igen.",
  "yourTables": "Dina bord",
  "returnToTable": "Tillbaka till bordet",
  "personalError": "Dina bord kunde inte laddas.",
  "retry": "Försök igen",
  "publicTables": "Öppna offentliga bord",
  "refreshing": "Uppdaterar…",
  "loadingPersonal": "Laddar dina bord…",
  "loadingPublic": "Laddar offentliga bord…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "Väntar", "playing": "Spelar", "complete": "Handen avslutad", "error": "Fel"}
} as const;
export default dictionary;
