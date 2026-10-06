import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Valitse pelitapa",
  title: "AI Hold'em",
  intro: "Pelaa Texas Hold’emia tekoälybotteja vastaan, kutsu ystäviä tai katso bottien peliä.",
  supportingCopy: "Hyppää heti yksityiseen kuuden paikan peliin viittä bottia vastaan tai mukauta oma pöytäsi.",
  quickPlay: "Pikapeli tekoälyä vastaan",
  play: "Pelaa",
  resources: "Projektin resurssit",
  about: "Tietoja",
  developerResources: "Kehittäjäresurssit",
  content: {
    play: {
      title: "Pelaa Texas Hold’emia tekoälyvastustajia vastaan",
      intro: "AI Hold’em on ilmainen selaimessa toimiva Texas Hold’em -peli, jossa vastassasi on tekoälyn ohjaamia pokerinpelaajia. Avaa sivu ja valitse pikapeli: pääset heti yksityiseen kuuden paikan peliin viittä bottia vastaan. Mitään ei tarvitse ladata eikä käyttäjätiliä luoda. Pelissä käytetään virtuaalisia pelimerkkejä, eikä siihen kuulu oikean rahan panoksia tai rahapalkintoja.",
      tables: "Voit myös luoda oman pöydän, valita kahdesta kuuteen paikkaa ja jakaa pöydän linkin ystävillesi. Ihmiset ja pokeribotit voivat pelata samassa pöydässä. Halutessasi voit täyttää paikat boteilla ja seurata, miten käsi etenee. Voit siis pelata botteja vastaan omassa rauhassa tai kutsua ystäviä yhteiseen peliin. Kortit, panostuskierrokset ja potit noudattavat no-limit Texas Hold’emin sääntöjä, ja koko peli toimii suoraan selaimessa.",
    },
    bots: {
      title: "Erilaisia pokeribotteja ja pelityylejä",
      description: "AI Hold’em tukee Equity Rules -bottia, joka käyttää sääntöjä, laskettua voittotodennäköisyyttä ja pottikertoimia, TypeSafe Jeviä, joka valitsee siirrot TypeSafe System Onen avulla, sekä määritettyjä kielimalleihin perustuvia pokeribotteja. Saatavilla olevat vastustajat riippuvat sivuston asetuksista. Eri agentit voivat valita eri siirtoja. Kielimallibottien päätöksiä ohjaavat tasapainoinen, tiukka tai aggressiivinen pelityyli.",
      aboutLink: "Lue lisää boteista ja AI Hold’emin toiminnasta",
    },
    faq: {
      title: "Usein kysyttyä AI Hold’emista",
      items: {
        free: {
          question: "Onko AI Hold’em ilmainen?",
          answer: "Kyllä. AI Hold’emia voi pelata ilmaiseksi selaimessa ilman rekisteröitymistä.",
        },
        ai: {
          question: "Voinko pelata Texas Hold’emia tekoälyä vastaan?",
          answer: "Kyllä. Pikapeli aloittaa yksityisen Texas Hold’em -pelin viittä tekoälybottia vastaan.",
        },
        friends: {
          question: "Voinko pelata ystävien kanssa?",
          answer: "Kyllä. Luo oma pöytä ja jaa sen linkki, jotta ystäväsi voivat liittyä vapaalle paikalle. Pöydässä voi olla kahdesta kuuteen pelaajaa, botit mukaan lukien.",
        },
        money: {
          question: "Pelataanko AI Hold’emissa oikealla rahalla?",
          answer: "Ei. Pelissä käytetään virtuaalisia pelimerkkejä. Oikean rahan panoksia tai rahapalkintoja ei ole.",
        }
      }
    }
  },
} satisfies LandingServerDictionary;

export default dictionary;
