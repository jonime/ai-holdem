import "server-only";
import directory from "../join-game/it-IT";
const dictionary = {
  "title": "Gioca",
  "intro": "Torna ai tuoi tavoli o trova un tavolo pubblico aperto.",
  "quickPlay": "Partita rapida contro IA",
  "createTable": "Crea tavolo",
  deleteTable: "Elimina tavolo",
  leaveAndRemove: "Lascia e rimuovi",
  removeFromList: "Rimuovi dai miei tavoli",
  confirmRemove: "Rimuovere «{title}» dai tuoi tavoli? Il tavolo e la cronologia restano disponibili agli altri giocatori. Se sei seduto, lascerai il tavolo: il posto si libera subito in attesa o a mano conclusa. Durante una mano, la partenza è irreversibile e passerai al prossimo turno consentito. I giocatori all-in mantengono il diritto al piatto.",
  deleteBlocked: "Altri giocatori umani hanno ancora posti occupati. Devono liberarli prima di eliminare il tavolo.",
  confirmDelete: "Eliminare “{title}”? La cronologia e il link condiviso saranno rimossi definitivamente.",
  confirmLeave: "Lasciare e rimuovere “{title}”? Durante una mano l’uscita è irreversibile. I posti in attesa o a mano conclusa si liberano subito; i giocatori attivi passano al prossimo turno consentito. I giocatori all-in mantengono il diritto al piatto.",
  removalConflict: "Il tavolo è cambiato. Controlla la lista aggiornata e riprova.",
  removalFailed: "Impossibile rimuovere il tavolo. Riprova.",
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
