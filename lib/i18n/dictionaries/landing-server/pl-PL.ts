import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Wybierz sposób gry",
  title: "AI Hold'em",
  intro: "Graj w Texas Hold’em przeciw botom AI, zapraszaj znajomych lub oglądaj grę botów.",
  supportingCopy: "Od razu rozpocznij prywatną grę przy sześcioosobowym stole przeciw pięciu botom lub skonfiguruj własny stół.",
  quickPlay: "Szybka gra z AI",
  customTable: "Utwórz własny stół",
  joinPublicTable: "Dołącz do publicznego stołu",
  resources: "Zasoby projektu",
  about: "O projekcie",
  developerResources: "Materiały dla programistów",
} satisfies LandingServerDictionary;

export default dictionary;
