import "server-only";
import type { JoinGameDictionary } from "../../types";
const dictionary = {
  title: "Unirse a una partida", intro: "Elige una mesa pública con anfitrión activo.", back: "Volver", playerName: "Tu nombre (opcional)", namePlaceholder: "Nombre del jugador", refresh: "Actualizar", refreshing: "Actualizando…", empty: "No hay mesas públicas disponibles ahora.", retry: "Reintentar", warning: "No se pudo actualizar la disponibilidad. Se muestran las últimas mesas conocidas.", initialError: "No se pudieron cargar las mesas públicas.", join: "Unirse", joining: "Uniéndose…", loadMore: "Cargar más", loadingMore: "Cargando…", unavailable: "Esa mesa ya no está disponible. La lista se ha actualizado.", conflict: "La mesa cambió. Revisa la lista actualizada e inténtalo de nuevo.", seats: "{occupied}/{total} asientos", people: "{humans} personas · {bots} bots", blinds: "Ciegas {small}/{big}", stack: "Fichas iniciales {stack}", fallbackTitle: "Mesa {id}",
} satisfies JoinGameDictionary;
export default dictionary;
