import "server-only";
import type { JoinGameDictionary } from "../../types";
const dictionary = {
  turnTimer: "Temps de réflexion humain: {duration}",
  timerOff: "Désactivé",
  timerDuration: "{seconds} secondes",
  title: "Rejoindre une partie", intro: "Choisissez une table publique dont l’hôte est actif.", back: "Retour", playerName: "Votre nom (facultatif)", namePlaceholder: "Nom du joueur", refresh: "Actualiser", refreshing: "Actualisation…", empty: "Aucune table publique n’est disponible actuellement.", retry: "Réessayer", warning: "La disponibilité n’a pas pu être actualisée. Les dernières tables connues sont affichées.", initialError: "Impossible de charger les tables publiques.", join: "Rejoindre", joining: "Connexion…", loadMore: "Afficher plus", loadingMore: "Chargement…", unavailable: "Cette table n’est plus disponible. La liste a été actualisée.", conflict: "Cette table a changé. Consultez la liste actualisée et réessayez.", seats: "{occupied}/{total} places", people: "{humans} humains · {bots} bots", blinds: "Blindes {small}/{big}", stack: "Tapis de départ {stack}", fallbackTitle: "Table {id}",
} satisfies JoinGameDictionary;
export default dictionary;
