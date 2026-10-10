import "server-only";
import directory from "../join-game/de-DE";
const dictionary = {
  "title": "Spielen",
  "intro": "Kehre zu deinen Tischen zurück oder finde einen offenen öffentlichen Tisch.",
  "quickPlay": "Schnellspiel gegen KI",
  "createTable": "Tisch erstellen",
  deleteTable: "Tisch löschen",
  leaveAndRemove: "Verlassen und entfernen",
  removeFromList: "Aus meinen Tischen entfernen",
  confirmRemove: "„{title}“ aus deinen Tischen entfernen? Tisch und Verlauf bleiben für andere Spieler erhalten. Falls du sitzt, verlässt du den Tisch: wartende oder abgeschlossene Hände geben den Platz sofort frei. Während einer Hand ist der Austritt unwiderruflich und du passt beim nächsten zulässigen Zug. All-in-Spieler bleiben am Pot beteiligt.",
  deleteBlocked: "Andere Menschen haben noch belegte Plätze. Diese müssen freigegeben werden, bevor der Tisch gelöscht werden kann.",
  confirmDelete: "„{title}“ löschen? Verlauf und geteilter Link werden dauerhaft entfernt.",
  confirmLeave: "„{title}“ verlassen und entfernen? Während einer Hand ist das unwiderruflich. Wartende oder abgeschlossene Plätze werden sofort frei; aktive Spieler passen beim nächsten erlaubten Zug. All-in-Spieler behalten ihren Anspruch auf den Pot.",
  removalConflict: "Der Tisch hat sich geändert. Prüfe die aktualisierte Liste und versuche es erneut.",
  removalFailed: "Der Tisch konnte nicht entfernt werden. Bitte versuche es erneut.",
  "yourTables": "Deine Tische",
  "returnToTable": "Zum Tisch zurück",
  "personalError": "Deine Tische konnten nicht geladen werden.",
  "retry": "Erneut versuchen",
  "publicTables": "Offene öffentliche Tische",
  "refreshing": "Aktualisierung…",
  "loadingPersonal": "Deine Tische werden geladen…",
  "loadingPublic": "Öffentliche Tische werden geladen…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "Wartend", "playing": "Im Spiel", "complete": "Hand beendet", "error": "Fehler"}
} as const;
export default dictionary;
