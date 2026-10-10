import "server-only";
import directory from "../join-game/es-ES";
const dictionary = {
  "title": "Jugar",
  "intro": "Vuelve a tus mesas o encuentra una mesa pública disponible.",
  "quickPlay": "Partida rápida contra IA",
  "createTable": "Crear mesa",
  deleteTable: "Eliminar mesa",
  leaveAndRemove: "Salir y quitar",
  removeFromList: "Quitar de mis mesas",
  confirmRemove: "¿Quitar «{title}» de tus mesas? La mesa y su historial seguirán disponibles para otros jugadores. Si estás sentado, saldrás: el asiento se libera inmediatamente en espera o con la mano terminada. Durante una mano, la salida es irreversible y te retiras en tu próximo turno legal. Los jugadores all-in conservan su derecho al bote.",
  deleteBlocked: "Otros jugadores humanos aún tienen asientos ocupados. Deben liberarlos antes de eliminar la mesa.",
  confirmDelete: "¿Eliminar «{title}»? Su historial y enlace compartido se eliminarán permanentemente.",
  confirmLeave: "¿Salir y quitar «{title}»? La salida es irreversible durante una mano. Los asientos en espera o con la mano terminada se liberan de inmediato; los jugadores activos se retiran en su próximo turno legal. Los jugadores all-in conservan su derecho al bote.",
  removalConflict: "La mesa ha cambiado. Revisa la lista actualizada y vuelve a intentarlo.",
  removalFailed: "No se pudo quitar la mesa. Vuelve a intentarlo.",
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
