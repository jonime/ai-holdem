import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Välj hur du vill spela",
  title: "AI Hold'em",
  intro: "Spela Texas Hold’em mot AI-botar, bjud in vänner eller se botar spela.",
  supportingCopy: "Hoppa direkt in i ett privat sexmannaspel mot fem botar eller anpassa ditt eget bord.",
  quickPlay: "Snabbspel mot AI",
  customTable: "Skapa anpassat bord",
  joinPublicTable: "Gå med i offentligt bord",
  resources: "Projektresurser",
  about: "Om projektet",
  developerResources: "Utvecklarresurser",
  content: {
    play: {
      title: "Spela Texas Hold’em mot AI-motståndare",
      intro: "AI Hold’em är ett gratis Texas Hold’em-spel som körs direkt i webbläsaren, där du kan spela mot AI-styrda pokerspelare. Öppna sidan och välj Snabbspel för att direkt starta ett privat spel med sex platser mot fem botar. Du behöver varken ladda ner något eller registrera dig. Du spelar med virtuella marker, utan insatser med riktiga pengar eller kontantvinster.",
      tables: "Vill du välja en annan uppställning kan du skapa ett eget bord med två till sex platser och dela länken med vänner. Människor och pokerbotar kan spela vid samma bord. Du kan också fylla platserna med botar och följa hur en hand utvecklas. Oavsett om du spelar själv mot botar eller bjuder in vänner följer korten, satsningsrundorna och potterna reglerna för no-limit Texas Hold’em.",
    },
    bots: {
      title: "Olika pokerbotar, olika strategier",
      description: "AI Hold’em stöder Equity Rules, en regelbaserad bot som använder beräknad equity och pottodds, TypeSafe Jev, som väljer drag via TypeSafe System One, och konfigurerade LLM-baserade pokerbotar. Vilka motståndare som finns beror på webbplatsens inställningar. Olika agenter kan fatta olika beslut, och LLM-botar har balanserade, tighta eller aggressiva spelstilar som vägleder dem.",
      aboutLink: "Läs mer om botarna och hur AI Hold’em fungerar",
    },
    faq: {
      title: "Vanliga frågor om AI Hold’em",
      items: {
        free: {
          question: "Är AI Hold’em gratis?",
          answer: "Ja. AI Hold’em är gratis att spela i webbläsaren utan registrering.",
        },
        ai: {
          question: "Kan jag spela Texas Hold’em mot AI?",
          answer: "Ja. Snabbspel startar ett privat Texas Hold’em-spel mot fem AI-pokerbotar.",
        },
        friends: {
          question: "Kan jag spela med vänner?",
          answer: "Ja. Skapa ett eget bord och dela länken så att vänner kan ta en ledig plats. Borden har två till sex platser, inklusive botar.",
        },
        money: {
          question: "Spelar man om riktiga pengar i AI Hold’em?",
          answer: "Nej. Spelet använder virtuella marker, utan insatser med riktiga pengar eller kontantvinster.",
        }
      }
    }
  },
} satisfies LandingServerDictionary;

export default dictionary;
