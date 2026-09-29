import "server-only";
import type { JoinGameDictionary } from "../../types";
const dictionary = {
  title: "Unisciti a una partita", intro: "Scegli un tavolo pubblico con host attivo.", back: "Indietro", playerName: "Il tuo nome (facoltativo)", namePlaceholder: "Nome giocatore", refresh: "Aggiorna", refreshing: "Aggiornamento…", empty: "Al momento non ci sono tavoli pubblici disponibili.", retry: "Riprova", warning: "Impossibile aggiornare la disponibilità. Sono mostrati gli ultimi tavoli noti.", initialError: "Impossibile caricare i tavoli pubblici.", join: "Unisciti", joining: "Accesso…", loadMore: "Carica altri", loadingMore: "Caricamento…", unavailable: "Quel tavolo non è più disponibile. L’elenco è stato aggiornato.", conflict: "Quel tavolo è cambiato. Controlla l’elenco aggiornato e riprova.", seats: "{occupied}/{total} posti", people: "{humans} persone · {bots} bot", blinds: "Bui {small}/{big}", stack: "Stack iniziale {stack}", fallbackTitle: "Tavolo {id}",
} satisfies JoinGameDictionary;
export default dictionary;
