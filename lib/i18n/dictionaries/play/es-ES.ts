import "server-only";
import directory from "../join-game/es-ES";
const dictionary = {
  "title": "Jugar",
  "intro": "Vuelve a tus mesas o encuentra una mesa pública disponible.",
  "createTable": "Crear mesa",
  "yourTables": "Tus mesas",
  "browserTables": "Estas mesas pertenecen a este navegador. Volver no garantiza que pueda empezar otra mano.",
  "recentlyActive": "Actividad reciente",
  "returnToTable": "Volver a la mesa",
  "personalError": "No se pudieron cargar tus mesas.",
  "retry": "Reintentar",
  "publicTables": "Mesas públicas abiertas",
  "refreshAll": "Actualizar todas las mesas",
  "refreshing": "Actualizando…",
  "loadingPersonal": "Cargando tus mesas…",
  "loadingPublic": "Cargando mesas públicas…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "En espera", "playing": "Jugando", "complete": "Mano terminada", "error": "Error"}
} as const;
export default dictionary;
