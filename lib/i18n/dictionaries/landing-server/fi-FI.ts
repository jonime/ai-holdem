import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Valitse pelitapa",
  title: "AI Hold'em",
  intro: "Pelaa Texas Hold’emia tekoälybotteja vastaan, kutsu ystäviä tai katso bottien peliä.",
  supportingCopy: "Hyppää heti yksityiseen kuuden paikan peliin viittä bottia vastaan tai mukauta oma pöytäsi.",
  quickPlay: "Pikapeli tekoälyä vastaan",
  customTable: "Luo mukautettu pöytä",
  joinPublicTable: "Liity julkiseen pöytään",
  resources: "Projektin resurssit",
  about: "Tietoja",
  developerResources: "Kehittäjäresurssit",
} satisfies LandingServerDictionary;

export default dictionary;
