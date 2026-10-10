import "server-only";
import directory from "../join-game/fi-FI";
const dictionary = {
  "title": "Pelaa",
  "intro": "Palaa pöytiisi tai etsi avoin julkinen pöytä.",
  "quickPlay": "Pikapeli tekoälyä vastaan",
  "createTable": "Luo pöytä",
  deleteTable: "Poista pöytä",
  leaveAndRemove: "Poistu ja poista listalta",
  removeFromList: "Poista omista pöydistä",
  confirmRemove: "Poistetaanko ”{title}” omista pöydistäsi? Pöytä ja sen historia säilyvät muille pelaajille. Jos istut pöydässä, poistut: paikka vapautuu heti odotustilassa tai päättyneen jaon jälkeen. Jaon aikana poistuminen on peruuttamatonta ja kippaat seuraavalla sallitulla vuorollasi. All-in-pelaajat säilyttävät oikeutensa pottiin.",
  deleteBlocked: "Muilla ihmisillä on vielä varattuja paikkoja. Paikat on vapautettava ennen pöydän poistamista.",
  confirmDelete: "Poistetaanko ”{title}”? Sen historia ja jaettu osoite poistetaan pysyvästi.",
  confirmLeave: "Poistutaanko pöydästä ”{title}” ja poistetaanko se listalta? Poistuminen on peruuttamaton käden aikana. Odottavan tai päättyneen käden paikat vapautuvat heti; aktiiviset pelaajat kippaavat seuraavalla laillisella vuorollaan. All-in-pelaajat säilyttävät oikeutensa pottiin.",
  removalConflict: "Pöytä muuttui. Tarkista päivitetty lista ja yritä uudelleen.",
  removalFailed: "Pöytää ei voitu poistaa. Yritä uudelleen.",
  "yourTables": "Omat pöytäsi",
  "returnToTable": "Palaa pöytään",
  "personalError": "Omia pöytiä ei voitu ladata.",
  "retry": "Yritä uudelleen",
  "publicTables": "Avoimet julkiset pöydät",
  "refreshing": "Päivitetään…",
  "loadingPersonal": "Ladataan omia pöytiä…",
  "loadingPublic": "Ladataan julkisia pöytiä…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "Odottaa", "playing": "Peli käynnissä", "complete": "Jako päättynyt", "error": "Virhe"}
} as const;
export default dictionary;
