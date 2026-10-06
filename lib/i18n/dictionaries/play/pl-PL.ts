import "server-only";
import directory from "../join-game/pl-PL";
const dictionary = {
  "title": "Graj",
  "intro": "Wróć do swoich stołów lub znajdź otwarty publiczny stół.",
  "createTable": "Utwórz stół",
  "yourTables": "Twoje stoły",
  "browserTables": "Te stoły należą do tej przeglądarki. Powrót nie gwarantuje rozpoczęcia kolejnego rozdania.",
  "recentlyActive": "Ostatnio aktywne",
  "returnToTable": "Wróć do stołu",
  "personalError": "Nie udało się wczytać twoich stołów.",
  "retry": "Spróbuj ponownie",
  "publicTables": "Otwarte publiczne stoły",
  "refreshAll": "Odśwież wszystkie stoły",
  "refreshing": "Odświeżanie…",
  "loadingPersonal": "Wczytywanie twoich stołów…",
  "loadingPublic": "Wczytywanie publicznych stołów…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "Oczekiwanie", "playing": "Gra trwa", "complete": "Rozdanie zakończone", "error": "Błąd"}
} as const;
export default dictionary;
