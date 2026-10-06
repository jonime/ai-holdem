import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Wybierz sposób gry",
  title: "AI Hold'em",
  intro: "Graj w Texas Hold’em przeciw botom AI, zapraszaj znajomych lub oglądaj grę botów.",
  supportingCopy: "Od razu rozpocznij prywatną grę przy sześcioosobowym stole przeciw pięciu botom lub skonfiguruj własny stół.",
  quickPlay: "Szybka gra z AI",
  play: "Graj",
  resources: "Zasoby projektu",
  about: "O projekcie",
  developerResources: "Materiały dla programistów",
  content: {
    play: {
      title: "Graj w Texas Hold’em przeciwko AI",
      intro: "AI Hold’em to darmowa gra w Texas Hold’em, która działa bezpośrednio w przeglądarce i pozwala zmierzyć się z graczami sterowanymi przez AI. Otwórz stronę i wybierz Szybką grę, aby od razu rozpocząć prywatną rozgrywkę przy sześcioosobowym stole przeciwko pięciu botom. Nie musisz niczego pobierać ani zakładać konta. Grasz wirtualnymi żetonami, bez zakładów na prawdziwe pieniądze i nagród pieniężnych.",
      tables: "Jeśli wolisz inny skład, utwórz własny stół z liczbą miejsc od dwóch do sześciu i udostępnij link znajomym. Ludzie i boty pokerowe mogą grać przy tym samym stole. Możesz też obsadzić wszystkie miejsca botami i obserwować przebieg rozdania. Niezależnie od tego, czy grasz sam przeciwko botom, czy zapraszasz znajomych, karty, rundy licytacji i pule podlegają zasadom Texas Hold’em bez limitu.",
    },
    bots: {
      title: "Różne boty pokerowe, różne strategie",
      description: "AI Hold’em obsługuje Equity Rules, bota opartego na regułach, który korzysta z obliczonego equity i pot odds; TypeSafe Jev, wybierającego zagrania przez TypeSafe System One; oraz skonfigurowane boty pokerowe oparte na modelach językowych (LLM). Dostępni przeciwnicy zależą od konfiguracji strony. Poszczególni agenci mogą podejmować różne decyzje, a boty LLM mają zrównoważony, ostrożny lub agresywny styl, który ukierunkowuje ich grę.",
      aboutLink: "Dowiedz się więcej o botach i działaniu AI Hold’em",
    },
    faq: {
      title: "Najczęstsze pytania o AI Hold’em",
      items: {
        free: {
          question: "Czy AI Hold’em jest darmowe?",
          answer: "Tak. Możesz grać za darmo w przeglądarce, bez rejestracji.",
        },
        ai: {
          question: "Czy mogę grać w Texas Hold’em przeciwko AI?",
          answer: "Tak. Szybka gra rozpoczyna prywatną rozgrywkę w Texas Hold’em przeciwko pięciu botom pokerowym AI.",
        },
        friends: {
          question: "Czy mogę grać ze znajomymi?",
          answer: "Tak. Utwórz własny stół i udostępnij link, aby znajomi mogli zająć wolne miejsce. Stoły mieszczą od dwóch do sześciu graczy, wliczając boty.",
        },
        money: {
          question: "Czy w AI Hold’em gra się na prawdziwe pieniądze?",
          answer: "Nie. Gra korzysta z wirtualnych żetonów, bez zakładów na prawdziwe pieniądze i nagród pieniężnych.",
        }
      }
    }
  },
} satisfies LandingServerDictionary;

export default dictionary;
