import "server-only";
import directory from "../join-game/fr-FR";
const dictionary = {
  "title": "Jouer",
  "intro": "Retrouvez vos tables ou trouvez une table publique ouverte.",
  "createTable": "Créer une table",
  "yourTables": "Vos tables",
  "browserTables": "Ces tables appartiennent à ce navigateur. Y revenir ne garantit pas de pouvoir commencer une autre main.",
  "recentlyActive": "Activité récente",
  "returnToTable": "Revenir à la table",
  "personalError": "Impossible de charger vos tables.",
  "retry": "Réessayer",
  "publicTables": "Tables publiques ouvertes",
  "refreshAll": "Actualiser toutes les tables",
  "refreshing": "Actualisation…",
  "loadingPersonal": "Chargement de vos tables…",
  "loadingPublic": "Chargement des tables publiques…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "En attente", "playing": "En cours", "complete": "Main terminée", "error": "Erreur"}
} as const;
export default dictionary;
