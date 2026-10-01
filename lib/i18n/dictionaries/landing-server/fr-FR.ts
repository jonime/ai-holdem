import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Choisir comment jouer",
  title: "AI Hold'em",
  intro: "Jouez au Texas Hold’em contre des bots IA, invitez des amis ou regardez les bots jouer.",
  supportingCopy: "Rejoignez immédiatement une partie privée à six places contre cinq bots ou personnalisez votre table.",
  quickPlay: "Partie rapide contre l’IA",
  customTable: "Créer une table personnalisée",
  joinPublicTable: "Rejoindre une table publique",
  resources: "Ressources du projet",
  about: "À propos",
  developerResources: "Ressources pour développeurs",
} satisfies LandingServerDictionary;

export default dictionary;
