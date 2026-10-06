import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Scegli come giocare",
  title: "AI Hold'em",
  intro: "Gioca a Texas Hold’em contro bot IA, invita gli amici o guarda i bot giocare.",
  supportingCopy: "Entra subito in una partita privata a sei posti contro cinque bot o personalizza il tuo tavolo.",
  quickPlay: "Partita rapida contro l’IA",
  play: "Gioca",
  resources: "Risorse del progetto",
  about: "Informazioni",
  developerResources: "Risorse per sviluppatori",
  content: {
    play: {
      title: "Gioca a Texas Hold’em contro avversari IA",
      intro: "AI Hold’em è un gioco gratuito di Texas Hold’em che funziona direttamente nel browser e ti permette di affrontare giocatori di poker controllati dall’IA. Apri la pagina e scegli Partita rapida per iniziare subito una partita privata con sei posti contro cinque bot, senza scaricare nulla o registrarti. Si gioca con fiches virtuali: non ci sono puntate con denaro reale né premi in denaro.",
      tables: "Se preferisci una configurazione diversa, crea un tavolo personalizzato da due a sei posti e condividi il link con gli amici. Persone e bot possono giocare allo stesso tavolo. Puoi anche riempire i posti con bot e osservare lo svolgimento di una mano. Che tu giochi da solo contro i bot o inviti gli amici, le carte, i giri di puntate e i piatti seguono le regole del Texas Hold’em no-limit.",
    },
    bots: {
      title: "Bot di poker diversi, strategie diverse",
      description: "AI Hold’em supporta Equity Rules, un bot basato su regole che usa equity calcolata e pot odds; TypeSafe Jev, che sceglie le mosse tramite TypeSafe System One; e bot di poker configurati basati su modelli linguistici (LLM). Gli avversari disponibili dipendono dalla configurazione del sito. Agenti diversi possono prendere decisioni diverse, e i bot LLM hanno stili equilibrato, tight o aggressivo che ne guidano le scelte.",
      aboutLink: "Scopri di più sui bot e sul funzionamento di AI Hold’em",
    },
    faq: {
      title: "Domande frequenti su AI Hold’em",
      items: {
        free: {
          question: "AI Hold’em è gratuito?",
          answer: "Sì. Puoi giocare gratuitamente nel browser, senza registrarti.",
        },
        ai: {
          question: "Posso giocare a Texas Hold’em contro l’IA?",
          answer: "Sì. Partita rapida avvia una partita privata di Texas Hold’em contro cinque bot di poker IA.",
        },
        friends: {
          question: "Posso giocare con gli amici?",
          answer: "Sì. Crea un tavolo personalizzato e condividi il link per permettere agli amici di occupare un posto libero. I tavoli ospitano da due a sei giocatori, bot inclusi.",
        },
        money: {
          question: "AI Hold’em è poker con denaro reale?",
          answer: "No. Si usano fiches virtuali, senza puntate con denaro reale né premi in denaro.",
        }
      }
    }
  },
} satisfies LandingServerDictionary;

export default dictionary;
