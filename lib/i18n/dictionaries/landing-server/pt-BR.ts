import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Escolha como jogar",
  title: "AI Hold'em",
  intro: "Jogue Texas Hold’em contra bots de IA, convide amigos ou assista aos bots jogarem.",
  supportingCopy: "Entre na hora em uma partida privada de seis lugares contra cinco bots ou personalize sua própria mesa.",
  quickPlay: "Jogo rápido contra IA",
  customTable: "Criar mesa personalizada",
  joinPublicTable: "Entrar em uma mesa pública",
  resources: "Recursos do projeto",
  about: "Sobre",
  developerResources: "Recursos para desenvolvedores",
  content: {
    play: {
      title: "Jogue Texas Hold’em contra adversários de IA",
      intro: "AI Hold’em é um jogo gratuito de Texas Hold’em que funciona diretamente no navegador, com jogadores de pôquer controlados por IA. Abra a página e escolha Jogo rápido para começar imediatamente uma partida privada de seis lugares contra cinco bots, sem baixar nada nem criar uma conta. Você joga com fichas virtuais: não há apostas com dinheiro real nem prêmios em dinheiro.",
      tables: "Se preferir outra configuração, crie uma mesa personalizada com dois a seis lugares e compartilhe o link com amigos. Pessoas e bots de pôquer podem jogar na mesma mesa. Você também pode preencher os lugares com bots e observar como uma mão se desenrola. Seja para jogar sozinho contra bots ou reunir os amigos, as cartas, as rodadas de apostas e os potes seguem as regras do Texas Hold’em sem limite.",
    },
    bots: {
      title: "Bots de pôquer diferentes, estratégias diferentes",
      description: "AI Hold’em oferece suporte ao Equity Rules, um bot baseado em regras que usa equidade calculada e odds do pote; ao TypeSafe Jev, que escolhe jogadas pelo TypeSafe System One; e a bots de pôquer baseados em modelos de linguagem (LLM). Os adversários disponíveis dependem da configuração do site. Agentes diferentes podem tomar decisões diferentes, e os bots LLM têm estilos equilibrado, conservador ou agressivo para orientar suas jogadas.",
      aboutLink: "Saiba mais sobre os bots e como o AI Hold’em funciona",
    },
    faq: {
      title: "Perguntas frequentes sobre AI Hold’em",
      items: {
        free: {
          question: "AI Hold’em é gratuito?",
          answer: "Sim. Você pode jogar gratuitamente no navegador, sem cadastro.",
        },
        ai: {
          question: "Posso jogar Texas Hold’em contra IA?",
          answer: "Sim. Jogo rápido inicia uma partida privada de Texas Hold’em contra cinco bots de pôquer com IA.",
        },
        friends: {
          question: "Posso jogar com amigos?",
          answer: "Sim. Crie uma mesa personalizada e compartilhe o link para que seus amigos ocupem um lugar livre. As mesas comportam dois a seis jogadores, incluindo bots.",
        },
        money: {
          question: "AI Hold’em é pôquer com dinheiro real?",
          answer: "Não. O jogo usa fichas virtuais, sem apostas com dinheiro real nem prêmios em dinheiro.",
        }
      }
    }
  },
} satisfies LandingServerDictionary;

export default dictionary;
