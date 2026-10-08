import "server-only";
import type { JoinGameDictionary } from "../../types";
const dictionary = {
  turnTimer: "Zeitlimit für menschliche Züge: {duration}",
  timerOff: "Aus",
  timerDuration: "{seconds} Sekunden",
  title: "Spiel beitreten", intro: "Wähle einen öffentlichen Tisch mit aktivem Host.", back: "Zurück", playerName: "Dein Name (optional)", namePlaceholder: "Spielername", refresh: "Aktualisieren", refreshing: "Wird aktualisiert…", empty: "Derzeit sind keine öffentlichen Tische verfügbar.", retry: "Erneut versuchen", warning: "Die Verfügbarkeit konnte nicht aktualisiert werden. Die zuletzt bekannten Tische werden angezeigt.", initialError: "Öffentliche Tische konnten nicht geladen werden.", join: "Beitreten", joining: "Beitritt…", loadMore: "Mehr laden", loadingMore: "Wird geladen…", unavailable: "Dieser Tisch ist nicht mehr verfügbar. Die Liste wurde aktualisiert.", conflict: "Der Tisch hat sich geändert. Prüfe die aktualisierte Liste und versuche es erneut.", seats: "{occupied}/{total} Plätze", people: "{humans} Menschen · {bots} Bots", blinds: "Blinds {small}/{big}", stack: "Startstack {stack}", fallbackTitle: "Tisch {id}",
} satisfies JoinGameDictionary;
export default dictionary;
