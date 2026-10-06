import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Choisir comment jouer",
  title: "AI Hold'em",
  intro: "Jouez au Texas Hold’em contre des bots IA, invitez des amis ou regardez les bots jouer.",
  supportingCopy: "Rejoignez immédiatement une partie privée à six places contre cinq bots ou personnalisez votre table.",
  quickPlay: "Partie rapide contre l’IA",
  play: "Jouer",
  resources: "Ressources du projet",
  about: "À propos",
  developerResources: "Ressources pour développeurs",
  content: {
    play: {
      title: "Jouez au Texas Hold’em contre des adversaires IA",
      intro: "AI Hold’em est un jeu gratuit de Texas Hold’em qui fonctionne directement dans votre navigateur. Vous pouvez y affronter des joueurs de poker contrôlés par l’IA. Ouvrez la page et choisissez Partie rapide pour lancer immédiatement une partie privée de six places contre cinq bots, sans téléchargement ni inscription. Vous jouez avec des jetons virtuels : il n’y a ni mises en argent réel ni gains en espèces.",
      tables: "Pour une autre configuration, créez une table personnalisée de deux à six places et partagez son lien avec vos amis. Joueurs humains et bots peuvent se retrouver à la même table. Vous pouvez aussi remplir les places avec des bots et regarder une main se dérouler. Que vous jouiez seul contre des bots ou avec vos amis, les cartes, les tours de mise et les pots suivent les règles du Texas Hold’em sans limite.",
    },
    bots: {
      title: "Différents bots de poker, différentes stratégies",
      description: "AI Hold’em prend en charge Equity Rules, un bot fondé sur des règles qui utilise l’équité calculée et les cotes du pot ; TypeSafe Jev, qui choisit ses actions via TypeSafe System One ; et des bots de poker utilisant des modèles de langage (LLM). Les adversaires disponibles dépendent de la configuration du site. Les agents peuvent prendre des décisions différentes, et les bots LLM disposent de styles équilibré, serré ou agressif pour guider leur jeu.",
      aboutLink: "Découvrez les bots et le fonctionnement d’AI Hold’em",
    },
    faq: {
      title: "Questions fréquentes sur AI Hold’em",
      items: {
        free: {
          question: "AI Hold’em est-il gratuit ?",
          answer: "Oui. Vous pouvez jouer gratuitement dans votre navigateur, sans inscription.",
        },
        ai: {
          question: "Puis-je jouer au Texas Hold’em contre une IA ?",
          answer: "Oui. Partie rapide lance une partie privée de Texas Hold’em contre cinq bots de poker IA.",
        },
        friends: {
          question: "Puis-je jouer avec des amis ?",
          answer: "Oui. Créez une table personnalisée et partagez son lien pour que vos amis rejoignent une place libre. Les tables accueillent de deux à six joueurs, bots compris.",
        },
        money: {
          question: "AI Hold’em est-il un jeu de poker en argent réel ?",
          answer: "Non. Le jeu utilise des jetons virtuels, sans mises en argent réel ni gains en espèces.",
        }
      }
    }
  },
} satisfies LandingServerDictionary;

export default dictionary;
