import "server-only";
import type { JoinGameDictionary } from "../../types";
const dictionary = {
  title: "Liity peliin", intro: "Valitse julkinen pöytä, jonka isäntä on paikalla.", back: "Takaisin", playerName: "Nimesi (valinnainen)", namePlaceholder: "Pelaajan nimi", refresh: "Päivitä", refreshing: "Päivitetään…", empty: "Julkisia pöytiä ei ole juuri nyt.", retry: "Yritä uudelleen", warning: "Saatavuutta ei voitu päivittää. Näytetään viimeksi tunnetut pöydät.", initialError: "Julkisia pöytiä ei voitu ladata.", join: "Liity", joining: "Liitytään…", loadMore: "Lataa lisää", loadingMore: "Ladataan…", unavailable: "Pöytä ei ole enää saatavilla. Luettelo päivitettiin.", conflict: "Pöytä muuttui. Tarkista päivitetty luettelo ja yritä uudelleen.", seats: "{occupied}/{total} paikkaa", people: "{humans} ihmistä · {bots} bottia", blinds: "Blindit {small}/{big}", stack: "Aloitusmerkit {stack}", fallbackTitle: "Pöytä {id}",
} satisfies JoinGameDictionary;
export default dictionary;
