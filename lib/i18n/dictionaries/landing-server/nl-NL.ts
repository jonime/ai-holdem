import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Kies hoe je speelt",
  title: "AI Hold'em",
  intro: "Speel Texas Hold’em tegen AI-bots, nodig vrienden uit of kijk hoe bots spelen.",
  supportingCopy: "Begin direct een privéspel met zes plaatsen tegen vijf bots of stel je eigen tafel samen.",
  quickPlay: "Snel spelen tegen AI",
  customTable: "Aangepaste tafel maken",
  joinPublicTable: "Deelnemen aan openbare tafel",
  resources: "Projectbronnen",
  about: "Over",
  developerResources: "Ontwikkelaarsbronnen",
  content: {
    play: {
      title: "Speel Texas Hold’em tegen AI-tegenstanders",
      intro: "AI Hold’em is een gratis Texas Hold’em-spel dat rechtstreeks in je browser werkt. Je speelt tegen pokerspelers die door AI worden aangestuurd. Open de pagina en kies Snel spelen om meteen een privéspel met zes plaatsen tegen vijf bots te starten. Je hoeft niets te downloaden en geen account aan te maken. Je speelt met virtuele fiches, zonder inzetten met echt geld of geldprijzen.",
      tables: "Wil je een andere samenstelling, maak dan een eigen tafel met twee tot zes plaatsen en deel de link met vrienden. Mensen en pokerbots kunnen aan dezelfde tafel spelen. Je kunt ook alle plaatsen met bots vullen en kijken hoe een hand verloopt. Of je nu alleen tegen bots speelt of vrienden uitnodigt, de kaarten, inzetrondes en potten volgen de regels van no-limit Texas Hold’em.",
    },
    bots: {
      title: "Verschillende pokerbots, verschillende strategieën",
      description: "AI Hold’em ondersteunt Equity Rules, een bot die op basis van regels, berekende equity en pot odds speelt; TypeSafe Jev, die zetten kiest via TypeSafe System One; en ingestelde pokerbots op basis van taalmodellen (LLM’s). De beschikbare tegenstanders hangen af van de configuratie van de site. Verschillende agenten kunnen andere beslissingen nemen, en LLM-bots gebruiken een gebalanceerde, tighte of agressieve speelstijl als leidraad.",
      aboutLink: "Lees meer over de bots en hoe AI Hold’em werkt",
    },
    faq: {
      title: "Veelgestelde vragen over AI Hold’em",
      items: {
        free: {
          question: "Is AI Hold’em gratis?",
          answer: "Ja. Je kunt gratis in je browser spelen, zonder je te registreren.",
        },
        ai: {
          question: "Kan ik Texas Hold’em tegen AI spelen?",
          answer: "Ja. Snel spelen start een privéspel Texas Hold’em tegen vijf AI-pokerbots.",
        },
        friends: {
          question: "Kan ik met vrienden spelen?",
          answer: "Ja. Maak een eigen tafel en deel de link zodat vrienden een vrije plaats kunnen innemen. Tafels hebben twee tot zes plaatsen, inclusief bots.",
        },
        money: {
          question: "Speel je bij AI Hold’em om echt geld?",
          answer: "Nee. Het spel gebruikt virtuele fiches, zonder inzetten met echt geld of geldprijzen.",
        }
      }
    }
  },
} satisfies LandingServerDictionary;

export default dictionary;
