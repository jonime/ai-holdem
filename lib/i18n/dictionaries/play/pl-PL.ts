import "server-only";
import directory from "../join-game/pl-PL";
const dictionary = {
  "title": "Graj",
  "intro": "Wróć do swoich stołów lub znajdź otwarty publiczny stół.",
  "quickPlay": "Szybka gra z AI",
  "createTable": "Utwórz stół",
  deleteTable: "Usuń stół",
  leaveAndRemove: "Opuść i usuń",
  deleteBlocked: "Inni gracze nadal zajmują miejsca. Muszą je zwolnić przed usunięciem stołu.",
  confirmDelete: "Usunąć „{title}”? Historia i udostępniony adres zostaną trwale usunięte.",
  confirmLeave: "Opuścić i usunąć „{title}”? Podczas rozdania jest to nieodwracalne. Miejsca oczekujące lub po zakończonym rozdaniu zwalniają się od razu; aktywni gracze pasują w następnej dozwolonej turze. Gracze all-in zachowują prawo do puli.",
  removalConflict: "Stół się zmienił. Sprawdź odświeżoną listę i spróbuj ponownie.",
  removalFailed: "Nie udało się usunąć stołu. Spróbuj ponownie.",
  "yourTables": "Twoje stoły",
  "returnToTable": "Wróć do stołu",
  "personalError": "Nie udało się wczytać twoich stołów.",
  "retry": "Spróbuj ponownie",
  "publicTables": "Otwarte publiczne stoły",
  "refreshing": "Odświeżanie…",
  "loadingPersonal": "Wczytywanie twoich stołów…",
  "loadingPublic": "Wczytywanie publicznych stołów…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "Oczekiwanie", "playing": "Gra trwa", "complete": "Rozdanie zakończone", "error": "Błąd"}
} as const;
export default dictionary;
