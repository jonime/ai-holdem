import "server-only";
import type { JoinGameDictionary } from "../../types";
const dictionary = {
  turnTimer: "Czas tury człowieka: {duration}",
  timerOff: "Wyłączony",
  timerDuration: "{seconds} sekund",
  title: "Dołącz do gry", intro: "Wybierz publiczny stół z aktywnym gospodarzem.", back: "Wstecz", playerName: "Twoja nazwa (opcjonalnie)", namePlaceholder: "Nazwa gracza", refresh: "Odśwież", refreshing: "Odświeżanie…", empty: "Obecnie nie ma dostępnych publicznych stołów.", retry: "Spróbuj ponownie", warning: "Nie udało się odświeżyć dostępności. Wyświetlamy ostatnio znane stoły.", initialError: "Nie udało się wczytać publicznych stołów.", join: "Dołącz", joining: "Dołączanie…", loadMore: "Wczytaj więcej", loadingMore: "Wczytywanie…", unavailable: "Ten stół nie jest już dostępny. Lista została odświeżona.", conflict: "Ten stół się zmienił. Sprawdź odświeżoną listę i spróbuj ponownie.", seats: "{occupied}/{total} miejsc", people: "{humans} ludzi · {bots} botów", blinds: "Ciemne {small}/{big}", stack: "Stack początkowy {stack}", fallbackTitle: "Stół {id}",
} satisfies JoinGameDictionary;
export default dictionary;
