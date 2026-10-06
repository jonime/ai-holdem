import "server-only";
import directory from "../join-game/fi-FI";
const dictionary = {
  "title": "Pelaa",
  "intro": "Palaa pöytiisi tai etsi avoin julkinen pöytä.",
  "createTable": "Luo pöytä",
  "yourTables": "Omat pöytäsi",
  "browserTables": "Nämä pöydät kuuluvat tälle selaimelle. Paluu ei takaa uuden jaon aloittamista.",
  "recentlyActive": "Viimeksi aktiiviset",
  "returnToTable": "Palaa pöytään",
  "personalError": "Omia pöytiä ei voitu ladata.",
  "retry": "Yritä uudelleen",
  "publicTables": "Avoimet julkiset pöydät",
  "refreshAll": "Päivitä kaikki pöydät",
  "refreshing": "Päivitetään…",
  "loadingPersonal": "Ladataan omia pöytiä…",
  "loadingPublic": "Ladataan julkisia pöytiä…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "Odottaa", "playing": "Peli käynnissä", "complete": "Jako päättynyt", "error": "Virhe"}
} as const;
export default dictionary;
