import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Starta ett nytt spel",
  title: "AI Hold'em",
  intro: "Skapa ett bord och bjud in någon till en ledig plats.",
  overviewHeading: "Spela Texas Hold'em med människor och AI",
  overviewIntro: "AI Hold'em är en webbläsarbaserad pokerdemo för två till sex platser. Skapa en privat bordslänk, bjud in andra, placera leverantörsanslutna eller deterministiska bottar på lediga platser och ställ in mörkar, startmarker och bottsvårighet före första handen.",
  engineHeading: "Regler som upprätthålls av pokermotorn",
  engineLinkLabel: "Pokermotorn",
  engineBody: "Pokermotorn bestämmer kortlek, turordning, tillåtna handlingar, satsningar, potter och vinnare. Varje förslag från en människa eller AI valideras innan spelet ändras. Bordet har liveuppdateringar, handlings- och handhistorik, kortvisning och fortsatt spel.",
  privacyHeading: "Granskbar AI och skyddade kort",
  privacyBody: "Välj TypeSafe System One, konfigurerade OpenRouter-modeller eller den deterministiska Equity Rules-botten. Aktiva privata kort, leverantörsprompter och råa modellsvar hålls dolda för åskådare. AI Hold'em är en teknisk demo med öppen källkod, inte en speltjänst med riktiga pengar.",
  resources: "Projektresurser",
  sourceBeforeGitHub: "Se källkoden på ",
  attributionAfterGitHub: ".",
  developerResources: "Utvecklarresurser",
} satisfies LandingServerDictionary;

export default dictionary;
