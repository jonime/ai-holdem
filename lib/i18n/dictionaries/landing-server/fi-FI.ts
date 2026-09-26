import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Aloita uusi peli",
  title: "AI Hold'em",
  intro: "Luo pöytä ja kutsu joku avoimelle paikalle.",
  overviewHeading: "Pelaa Texas Hold'emia ihmisten ja tekoälyn kanssa",
  overviewIntro: "AI Hold'em on selaimessa toimiva pokeridemo kahdesta kuuteen pelaajalle. Luo yksityinen pöytälinkki, kutsu muita pelaajia, lisää vapaille paikoille palvelupohjaisia tai deterministisiä botteja ja määritä blindit, aloituspinot sekä bottien vaikeustaso ennen ensimmäistä kättä.",
  engineHeading: "Pokerimoottori valvoo sääntöjä",
  engineLinkLabel: "Pokerimoottori",
  engineBody: "Pokerimoottori määrää korttipakan, vuorojärjestyksen, sallitut toiminnot, panostuksen, potit ja voittajat. Jokainen ihmisen tai tekoälyn ehdottama toiminto tarkistetaan ennen pelitilan muuttamista. Pöytä sisältää reaaliaikaiset päivitykset, toiminto- ja käsihistorian sekä korttien näyttämisen.",
  privacyHeading: "Tarkasteltava tekoäly, suojatut kortit",
  privacyBody: "Valitse TypeSafe System One, määritetty OpenRouter-malli tai deterministinen Equity Rules -botti. Aktiiviset taskukortit, palvelupyynnöt ja mallien raakavastaukset pidetään poissa katsojilta. AI Hold'em on avoimen lähdekoodin tekninen demo, ei oikean rahan rahapelipalvelu.",
  resources: "Projektin resurssit",
  sourceBeforeGitHub: "Katso lähdekoodi ",
  attributionAfterGitHub: ".",
  developerResources: "Kehittäjäresurssit",
} satisfies LandingServerDictionary;

export default dictionary;
