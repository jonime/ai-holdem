import "server-only";
import type { JoinGameDictionary } from "../../types";
const dictionary = {
  title: "Deelnemen aan een spel", intro: "Kies een openbare tafel met een actieve host.", back: "Terug", playerName: "Je naam (optioneel)", namePlaceholder: "Spelersnaam", refresh: "Vernieuwen", refreshing: "Vernieuwen…", empty: "Er zijn momenteel geen openbare tafels beschikbaar.", retry: "Opnieuw proberen", warning: "Beschikbaarheid kon niet worden vernieuwd. De laatst bekende tafels worden getoond.", initialError: "Openbare tafels konden niet worden geladen.", join: "Deelnemen", joining: "Deelnemen…", loadMore: "Meer laden", loadingMore: "Laden…", unavailable: "Die tafel is niet meer beschikbaar. De lijst is vernieuwd.", conflict: "Die tafel is gewijzigd. Bekijk de vernieuwde lijst en probeer opnieuw.", seats: "{occupied}/{total} plaatsen", people: "{humans} mensen · {bots} bots", blinds: "Blinds {small}/{big}", stack: "Beginstack {stack}", fallbackTitle: "Tafel {id}",
} satisfies JoinGameDictionary;
export default dictionary;
