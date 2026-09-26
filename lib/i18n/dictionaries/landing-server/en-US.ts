import "server-only";

const dictionary = {
  startRegion: "Start a new game",
  title: "AI Hold'em",
  intro: "Create a table, then invite someone to take an open seat.",
  overviewHeading: "Play Texas Hold'em with people and AI",
  overviewIntro: "AI Hold'em is a browser-based poker demo for two to six seats. Create a private table link, invite other people, assign provider-backed or deterministic bots to open seats, and configure blinds, starting stacks, and bot difficulty before the first hand.",
  engineHeading: "Rules enforced by the poker engine",
  engineLinkLabel: "poker engine",
  engineBody: "The poker engine is authoritative for the deck, turn order, legal actions, betting, pots, and winners. Every human or AI proposal is validated before it changes the game. The table includes live updates, action history, completed-hand history, card reveals, and another-hand play.",
  privacyHeading: "Inspectable AI, protected cards",
  privacyBody: "Choose TypeSafe System One, configured OpenRouter models, or the deterministic offline Equity Rules bot. Active private cards, provider prompts, and raw model responses stay hidden from spectators. AI Hold'em is an open-source technical demonstration, not a real-money gambling service.",
  resources: "Project resources",
  sourceBeforeGitHub: "View the source on ",
  attributionAfterGitHub: ".",
  developerResources: "Developer resources",
} as const;

export default dictionary;
