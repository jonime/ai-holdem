import "server-only";
const dictionary = {
  turnTimer: "Human turn timer: {duration}",
  timerOff: "Off",
  timerDuration: "{seconds} seconds",
  title: "Join a game", intro: "Choose a public table with an active host.", back: "Back",
  playerName: "Your name (optional)", namePlaceholder: "Player name", refresh: "Refresh",
  refreshing: "Refreshing…", empty: "No public tables are available right now.", retry: "Try again",
  warning: "Availability could not be refreshed. Showing the last known tables.", initialError: "Public tables could not be loaded.",
  join: "Join", joining: "Joining…", loadMore: "Load more", loadingMore: "Loading…",
  unavailable: "That table is no longer available. The list has been refreshed.", conflict: "That table changed. Review the refreshed list and try again.",
  seats: "{occupied}/{total} seats", people: "{humans} human · {bots} bots", blinds: "Blinds {small}/{big}", stack: "Starting stack {stack}",
  fallbackTitle: "Table {id}",
} as const;
export default dictionary;
