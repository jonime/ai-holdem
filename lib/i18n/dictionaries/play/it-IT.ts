import "server-only";
import directory from "../join-game/it-IT";
const dictionary = {
  "title": "Gioca",
  "intro": "Torna ai tuoi tavoli o trova un tavolo pubblico aperto.",
  "quickPlay": "Partita rapida contro IA",
  "createTable": "Crea tavolo",
  "yourTables": "I tuoi tavoli",
  "returnToTable": "Torna al tavolo",
  "personalError": "Impossibile caricare i tuoi tavoli.",
  "retry": "Riprova",
  "publicTables": "Tavoli pubblici aperti",
  "refreshing": "Aggiornamento…",
  "loadingPersonal": "Caricamento dei tuoi tavoli…",
  "loadingPublic": "Caricamento dei tavoli pubblici…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "In attesa", "playing": "In gioco", "complete": "Mano conclusa", "error": "Errore"}
} as const;
export default dictionary;
