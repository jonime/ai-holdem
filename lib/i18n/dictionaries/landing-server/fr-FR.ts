import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Démarrer une nouvelle partie",
  title: "AI Hold'em",
  intro: "Créez une table, puis invitez quelqu’un à prendre une place libre.",
  overviewHeading: "Jouez au Texas Hold'em avec des humains et des IA",
  overviewIntro: "AI Hold'em est une démo de poker dans le navigateur pour deux à six places. Créez un lien de table privé, invitez d'autres personnes, affectez des bots déterministes ou connectés à un fournisseur aux places libres, puis réglez les blindes, les tapis et la difficulté avant la première main.",
  engineHeading: "Des règles imposées par le moteur de poker",
  engineLinkLabel: "moteur de poker",
  engineBody: "Le moteur de poker fait autorité pour les cartes, l'ordre des tours, les actions légales, les mises, les pots et les gagnants. Chaque proposition humaine ou d'IA est validée avant de modifier la partie. La table offre les mises à jour en direct, l'historique des actions et des mains, et la révélation des cartes.",
  privacyHeading: "Une IA vérifiable et des cartes protégées",
  privacyBody: "Choisissez TypeSafe System One, des modèles OpenRouter configurés ou le bot déterministe Equity Rules. Les cartes privées actives, les requêtes aux fournisseurs et les réponses brutes restent cachées aux spectateurs. AI Hold'em est une démo technique open source, pas un service de jeu d'argent réel.",
  resources: "Ressources du projet",
  sourceBeforeGitHub: "Consultez le code source sur ",
  attributionAfterGitHub: ".",
  developerResources: "Ressources pour développeurs",
} satisfies LandingServerDictionary;

export default dictionary;
