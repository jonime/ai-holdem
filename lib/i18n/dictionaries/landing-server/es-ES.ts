import "server-only";

import type { LandingServerDictionary } from "../../types";

const dictionary = {
  startRegion: "Iniciar una partida nueva",
  title: "AI Hold'em",
  intro: "Crea una mesa e invita a alguien a ocupar un asiento libre.",
  overviewHeading: "Juega al Texas Hold'em con personas e IA",
  overviewIntro: "AI Hold'em es una demostración de póquer en el navegador para mesas de dos a seis plazas. Crea un enlace privado, invita a otras personas, asigna bots conectados a proveedores o deterministas a los asientos libres y configura las ciegas, los stacks iniciales y la dificultad antes de la primera mano.",
  engineHeading: "Reglas aplicadas por el motor de póquer",
  engineLinkLabel: "motor de póquer",
  engineBody: "El motor de póquer es la autoridad para la baraja, los turnos, las acciones legales, las apuestas, los botes y los ganadores. Cada propuesta humana o de IA se valida antes de cambiar la partida. La mesa incluye actualizaciones en vivo, historial de acciones y manos, revelación de cartas y nuevas manos.",
  privacyHeading: "IA inspeccionable y cartas protegidas",
  privacyBody: "Elige TypeSafe System One, modelos configurados de OpenRouter o el bot determinista Equity Rules. Las cartas privadas activas, las entradas al proveedor y las respuestas sin procesar permanecen ocultas a los espectadores. AI Hold'em es una demostración técnica de código abierto, no un servicio de apuestas con dinero real.",
  resources: "Recursos del proyecto",
  sourceBeforeGitHub: "Consulta el código fuente en ",
  attributionAfterGitHub: ".",
  developerResources: "Recursos para desarrolladores",
} satisfies LandingServerDictionary;

export default dictionary;
