import "server-only";
import type { JoinGameDictionary } from "../../types";
const dictionary = {
  title: "Gå med i ett spel", intro: "Välj ett offentligt bord med en aktiv värd.", back: "Tillbaka", playerName: "Ditt namn (valfritt)", namePlaceholder: "Spelarnamn", refresh: "Uppdatera", refreshing: "Uppdaterar…", empty: "Inga offentliga bord är tillgängliga just nu.", retry: "Försök igen", warning: "Tillgängligheten kunde inte uppdateras. Senast kända bord visas.", initialError: "Offentliga bord kunde inte läsas in.", join: "Gå med", joining: "Ansluter…", loadMore: "Läs in fler", loadingMore: "Läser in…", unavailable: "Bordet är inte längre tillgängligt. Listan har uppdaterats.", conflict: "Bordet ändrades. Kontrollera den uppdaterade listan och försök igen.", seats: "{occupied}/{total} platser", people: "{humans} personer · {bots} bottar", blinds: "Mörkar {small}/{big}", stack: "Startstack {stack}", fallbackTitle: "Bord {id}",
} satisfies JoinGameDictionary;
export default dictionary;
