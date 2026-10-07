import "server-only";
import directory from "../join-game/nl-NL";
const dictionary = {
  "title": "Spelen",
  "intro": "Keer terug naar je tafels of zoek een open openbare tafel.",
  "quickPlay": "Snel spelen tegen AI",
  "createTable": "Tafel maken",
  deleteTable: "Tafel verwijderen",
  leaveAndRemove: "Verlaten en verwijderen",
  deleteBlocked: "Andere mensen hebben nog bezette plaatsen. Die moeten vrijkomen voordat je de tafel kunt verwijderen.",
  confirmDelete: "“{title}” verwijderen? De geschiedenis en gedeelde link worden permanent verwijderd.",
  confirmLeave: "“{title}” verlaten en verwijderen? Vertrek is onomkeerbaar tijdens een hand. Wachtende of voltooide plaatsen komen direct vrij; actieve spelers folden op hun volgende toegestane beurt. All-in-spelers behouden hun recht op de pot.",
  removalConflict: "De tafel is gewijzigd. Bekijk de vernieuwde lijst en probeer opnieuw.",
  removalFailed: "De tafel kon niet worden verwijderd. Probeer opnieuw.",
  "yourTables": "Jouw tafels",
  "returnToTable": "Terug naar tafel",
  "personalError": "Je tafels konden niet worden geladen.",
  "retry": "Opnieuw proberen",
  "publicTables": "Open openbare tafels",
  "refreshing": "Vernieuwen…",
  "loadingPersonal": "Je tafels laden…",
  "loadingPublic": "Openbare tafels laden…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "Wachten", "playing": "Aan het spelen", "complete": "Hand voltooid", "error": "Fout"}
} as const;
export default dictionary;
