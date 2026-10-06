import "server-only";
import directory from "../join-game/es-ES";
const dictionary = {
  "title": "Jugar",
  "intro": "Vuelve a tus mesas o encuentra una mesa pública disponible.",
  "createTable": "Crear mesa",
  "yourTables": "Tus mesas",
  "returnToTable": "Volver a la mesa",
  "personalError": "No se pudieron cargar tus mesas.",
  "retry": "Reintentar",
  "publicTables": "Mesas públicas abiertas",
  "refreshing": "Actualizando…",
  "loadingPersonal": "Cargando tus mesas…",
  "loadingPublic": "Cargando mesas públicas…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "En espera", "playing": "Jugando", "complete": "Mano terminada", "error": "Error"}
} as const;
export default dictionary;
