import "server-only";
import directory from "../join-game/en-US";
const dictionary = {
  "title": "Play",
  "intro": "Return to your tables or find an open public table.",
  "quickPlay": "Quick Play vs AI",
  "createTable": "Create table",
  deleteTable: "Delete table",
  leaveAndRemove: "Leave and remove",
  deleteBlocked: "Other humans still have claimed seats. They must release their seats before you can delete this table.",
  confirmDelete: "Delete “{title}”? Its history and shared URL will be permanently removed.",
  confirmLeave: "Leave and remove “{title}”? Departure is irreversible during a hand. Waiting or completed seats release immediately; active seats fold on their next legal turn. All-in participants keep pot eligibility.",
  removalConflict: "The table changed. Review the refreshed list and retry explicitly.",
  removalFailed: "The table could not be removed. Please try again.",
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
