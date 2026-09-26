import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Iniciar um novo jogo",
  title: "AI Hold'em",
  intro: "Crie uma mesa e convide alguém para ocupar um lugar livre.",
  overviewHeading: "Jogue Texas Hold'em com pessoas e IA",
  overviewIntro: "AI Hold'em é uma demonstração de pôquer no navegador para duas a seis posições. Crie um link privado para a mesa, convide outras pessoas, atribua bots determinísticos ou conectados a provedores aos lugares livres e configure blinds, stacks iniciais e dificuldade antes da primeira mão.",
  engineHeading: "Regras aplicadas pelo mecanismo de pôquer",
  engineLinkLabel: "mecanismo de pôquer",
  engineBody: "O mecanismo de pôquer é a autoridade para o baralho, a ordem dos turnos, as ações legais, as apostas, os potes e os vencedores. Toda proposta humana ou de IA é validada antes de alterar o jogo. A mesa inclui atualizações ao vivo, histórico de ações e mãos, revelação de cartas e novas mãos.",
  privacyHeading: "IA inspecionável e cartas protegidas",
  privacyBody: "Escolha TypeSafe System One, modelos OpenRouter configurados ou o bot determinístico Equity Rules. Cartas privadas ativas, solicitações aos provedores e respostas brutas ficam ocultas dos espectadores. AI Hold'em é uma demonstração técnica de código aberto, não um serviço de apostas com dinheiro real.",
  resources: "Recursos do projeto",
  sourceBeforeGitHub: "Veja o código-fonte no ",
  attributionAfterGitHub: ".",
  developerResources: "Recursos para desenvolvedores",
} satisfies LandingServerDictionary;

export default dictionary;
