import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Een nieuw spel starten",
  title: "AI Hold'em",
  intro: "Maak een tafel en nodig iemand uit voor een vrije plaats.",
  overviewHeading: "Speel Texas Hold'em met mensen en AI",
  overviewIntro: "AI Hold'em is een pokerdemo in de browser voor twee tot zes plaatsen. Maak een privétafellink, nodig anderen uit, wijs provider-gestuurde of deterministische bots toe aan vrije plaatsen en stel blinds, beginstacks en botmoeilijkheid in vóór de eerste hand.",
  engineHeading: "Regels afgedwongen door de pokerengine",
  engineLinkLabel: "pokerengine",
  engineBody: "De pokerengine is bepalend voor kaarten, beurtvolgorde, toegestane acties, inzetten, potten en winnaars. Elk voorstel van een mens of AI wordt gevalideerd voordat het spel verandert. De tafel biedt live-updates, actie- en handgeschiedenis, kaartonthullingen en volgende handen.",
  privacyHeading: "Controleerbare AI en beschermde kaarten",
  privacyBody: "Kies TypeSafe System One, geconfigureerde OpenRouter-modellen of de deterministische Equity Rules-bot. Actieve privékaarten, providerprompts en ruwe modelantwoorden blijven verborgen voor toeschouwers. AI Hold'em is een technische opensourcedemo, geen gokdienst met echt geld.",
  resources: "Projectbronnen",
  sourceBeforeGitHub: "Bekijk de broncode op ",
  attributionAfterGitHub: ".",
  developerResources: "Ontwikkelaarsbronnen",
} satisfies LandingServerDictionary;

export default dictionary;
