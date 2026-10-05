import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Elige cómo jugar",
  title: "AI Hold'em",
  intro: "Juega Texas Hold’em contra bots de IA, invita a amigos o mira cómo juegan los bots.",
  supportingCopy: "Entra al instante en una partida privada de seis plazas contra cinco bots o personaliza tu propia mesa.",
  quickPlay: "Partida rápida contra IA",
  customTable: "Crear mesa personalizada",
  joinPublicTable: "Unirse a una mesa pública",
  resources: "Recursos del proyecto",
  about: "Acerca de",
  developerResources: "Recursos para desarrolladores",
  content: {
    play: {
      title: "Juega al Texas Hold’em contra oponentes de IA",
      intro: "AI Hold’em es un juego gratuito de Texas Hold’em que funciona directamente en el navegador y te permite jugar contra jugadores de póquer controlados por IA. Abre la página y elige Partida rápida para empezar de inmediato una partida privada de seis plazas contra cinco bots, sin descargas ni registro. Se juega con fichas virtuales: no hay apuestas con dinero real ni premios en efectivo.",
      tables: "Si prefieres otra configuración, crea una mesa personalizada de dos a seis plazas y comparte el enlace con tus amigos. Personas y bots pueden jugar en la misma mesa, o puedes llenar las plazas con bots y observar cómo se desarrolla una mano. Tanto si juegas por tu cuenta contra bots como si invitas a amigos, las cartas, las rondas de apuestas y los botes siguen las reglas del Texas Hold’em sin límite.",
    },
    bots: {
      title: "Distintos bots de póquer, distintas estrategias",
      description: "AI Hold’em admite Equity Rules, un bot basado en reglas que usa la equity calculada y las probabilidades del bote; TypeSafe Jev, que elige jugadas mediante TypeSafe System One; y bots de póquer basados en modelos de lenguaje (LLM). Los oponentes disponibles dependen de la configuración del sitio. Cada agente puede tomar decisiones distintas, y los bots LLM tienen estilos equilibrado, conservador o agresivo para orientar sus jugadas.",
      aboutLink: "Descubre más sobre los bots y cómo funciona AI Hold’em",
    },
    faq: {
      title: "Preguntas frecuentes sobre AI Hold’em",
      items: {
        free: {
          question: "¿Es gratis AI Hold’em?",
          answer: "Sí. Puedes jugar gratis en el navegador, sin registrarte.",
        },
        ai: {
          question: "¿Puedo jugar al Texas Hold’em contra IA?",
          answer: "Sí. Partida rápida inicia una partida privada de Texas Hold’em contra cinco bots de póquer con IA.",
        },
        friends: {
          question: "¿Puedo jugar con amigos?",
          answer: "Sí. Crea una mesa personalizada y comparte su enlace para que tus amigos ocupen una plaza libre. Las mesas admiten de dos a seis jugadores, incluidos los bots.",
        },
        money: {
          question: "¿Se juega con dinero real en AI Hold’em?",
          answer: "No. Se usan fichas virtuales, sin apuestas con dinero real ni premios en efectivo.",
        }
      }
    }
  },
} satisfies LandingServerDictionary;

export default dictionary;
