import "server-only";
import directory from "../join-game/it-IT";
const dictionary = {
  "title": "Gioca",
  "intro": "Torna ai tuoi tavoli o trova un tavolo pubblico aperto.",
  "createTable": "Crea tavolo",
  "yourTables": "I tuoi tavoli",
  "browserTables": "Questi tavoli appartengono a questo browser. Tornare non garantisce di poter iniziare un’altra mano.",
  "recentlyActive": "Attività recente",
  "returnToTable": "Torna al tavolo",
  "personalError": "Impossibile caricare i tuoi tavoli.",
  "retry": "Riprova",
  "publicTables": "Tavoli pubblici aperti",
  "refreshAll": "Aggiorna tutti i tavoli",
  "refreshing": "Aggiornamento…",
  "loadingPersonal": "Caricamento dei tuoi tavoli…",
  "loadingPublic": "Caricamento dei tavoli pubblici…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "In attesa", "playing": "In gioco", "complete": "Mano conclusa", "error": "Errore"}
} as const;
export default dictionary;
