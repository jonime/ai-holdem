import "server-only";
import directory from "../join-game/fr-FR";
const dictionary = {
  "title": "Jouer",
  "intro": "Retrouvez vos tables ou trouvez une table publique ouverte.",
  "quickPlay": "Partie rapide contre l’IA",
  "createTable": "Créer une table",
  "yourTables": "Vos tables",
  "returnToTable": "Revenir à la table",
  "personalError": "Impossible de charger vos tables.",
  "retry": "Réessayer",
  "publicTables": "Tables publiques ouvertes",
  "refreshing": "Actualisation…",
  "loadingPersonal": "Chargement de vos tables…",
  "loadingPublic": "Chargement des tables publiques…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "En attente", "playing": "En cours", "complete": "Main terminée", "error": "Erreur"}
} as const;
export default dictionary;
