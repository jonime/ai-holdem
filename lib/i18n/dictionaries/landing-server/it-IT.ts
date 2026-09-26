import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Inizia una nuova partita",
  title: "AI Hold'em",
  intro: "Crea un tavolo e invita qualcuno a occupare un posto libero.",
  overviewHeading: "Gioca a Texas Hold'em con persone e IA",
  overviewIntro: "AI Hold'em è una demo di poker nel browser per tavoli da due a sei posti. Crea un link privato, invita altre persone, assegna bot deterministici o collegati a provider ai posti liberi e configura bui, stack iniziali e difficoltà prima della prima mano.",
  engineHeading: "Regole applicate dal motore di poker",
  engineLinkLabel: "motore di poker",
  engineBody: "Il motore di poker è l'autorità per mazzo, ordine dei turni, azioni consentite, puntate, piatti e vincitori. Ogni proposta umana o dell'IA viene convalidata prima di modificare la partita. Il tavolo include aggiornamenti in diretta, cronologia di azioni e mani, carte rivelate e nuove mani.",
  privacyHeading: "IA verificabile e carte protette",
  privacyBody: "Scegli TypeSafe System One, modelli OpenRouter configurati o il bot deterministico Equity Rules. Le carte private attive, le richieste ai provider e le risposte grezze restano nascoste agli spettatori. AI Hold'em è una demo tecnica open source, non un servizio di gioco d'azzardo con denaro reale.",
  resources: "Risorse del progetto",
  sourceBeforeGitHub: "Consulta il codice sorgente su ",
  attributionAfterGitHub: ".",
  developerResources: "Risorse per sviluppatori",
} satisfies LandingServerDictionary;

export default dictionary;
