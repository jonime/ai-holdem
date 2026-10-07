import "server-only";
import directory from "../join-game/en-US";
const dictionary = {
  "title": "Play",
  "intro": "Return to your tables or find an open public table.",
  "quickPlay": "Quick Play vs AI",
  "createTable": "Create table",
  "yourTables": "Your tables",
  "returnToTable": "Return to table",
  "personalError": "Your tables could not be loaded.",
  "retry": "Retry",
  "publicTables": "Open public tables",
  "refreshing": "Refreshing…",
  "loadingPersonal": "Loading your tables…",
  "loadingPublic": "Loading public tables…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "Waiting", "playing": "Playing", "complete": "Hand complete", "error": "Error"}
} as const;
export default dictionary;
