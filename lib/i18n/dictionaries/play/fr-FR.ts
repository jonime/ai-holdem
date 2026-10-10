import "server-only";
import directory from "../join-game/fr-FR";
const dictionary = {
  "title": "Jouer",
  "intro": "Retrouvez vos tables ou trouvez une table publique ouverte.",
  "quickPlay": "Partie rapide contre l’IA",
  "createTable": "Créer une table",
  deleteTable: "Supprimer la table",
  leaveAndRemove: "Quitter et retirer",
  removeFromList: "Retirer de mes tables",
  confirmRemove: "Retirer « {title} » de vos tables ? La table et son historique restent accessibles aux autres joueurs. Si vous êtes assis, vous partez : la place se libère immédiatement en attente ou après une main terminée. Pendant une main, le départ est irréversible et vous vous couchez au prochain tour autorisé. Les joueurs à tapis conservent leur droit au pot.",
  deleteBlocked: "D’autres joueurs humains occupent encore des places. Ils doivent les libérer avant la suppression.",
  confirmDelete: "Supprimer « {title} » ? Son historique et son lien partagé seront supprimés définitivement.",
  confirmLeave: "Quitter et retirer « {title} » ? Le départ est irréversible pendant une main. Les places en attente ou après une main terminée sont libérées immédiatement ; les joueurs actifs se couchent à leur prochain tour légal. Les joueurs à tapis conservent leurs droits au pot.",
  removalConflict: "La table a changé. Consultez la liste actualisée et réessayez.",
  removalFailed: "Impossible de retirer la table. Veuillez réessayer.",
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
