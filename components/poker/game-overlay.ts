/** Navigation only: DOM return targets and feature work belong outside this module. */
export type GameOverlay =
  | { readonly kind: "none" }
  | { readonly kind: "actions" }
  | { readonly kind: "results" }
  | { readonly kind: "join" }
  | { readonly kind: "help" }
  | { readonly kind: "shareTable" }
  | { readonly kind: "settings" }
  | { readonly kind: "leave" }
  | { readonly kind: "botInformation"; readonly botId: string }
  | { readonly kind: "handReplay"; readonly handNumber: number; readonly origin: "actions" | "results" | "table" };

export interface OverlayNavigation {
  readonly gameId: string | undefined;
  readonly overlay: GameOverlay;
}
export interface OverlayEligibility {
  readonly isSpectator: boolean;
  readonly botInformationAvailable: boolean;
  readonly botIds: readonly string[];
}
export type OverlayEvent =
  | { readonly type: "open"; readonly overlay: Exclude<GameOverlay, { kind: "none" | "handReplay" }> }
  | { readonly type: "replay"; readonly handNumber: number }
  | { readonly type: "back"; readonly expected: OverlayNavigation }
  | { readonly type: "close"; readonly expected: OverlayNavigation }
  | { readonly type: "reconcile"; readonly gameId: string | undefined; readonly eligibility: OverlayEligibility };

export function initialOverlayNavigation(gameId: string | undefined): OverlayNavigation {
  return { gameId, overlay: { kind: "none" } };
}

export function canReturnToActions(overlay: GameOverlay): boolean {
  return overlay.kind === "handReplay" && overlay.origin === "actions";
}

export function canReturnToResults(overlay: GameOverlay): boolean {
  return overlay.kind === "handReplay" && overlay.origin === "results";
}

export function transitionOverlay(state: OverlayNavigation, event: OverlayEvent): OverlayNavigation {
  switch (event.type) {
    case "open": return { ...state, overlay: event.overlay };
    case "replay": return { ...state, overlay: { kind: "handReplay", handNumber: event.handNumber,
      origin: state.overlay.kind === "actions" || state.overlay.kind === "results" ? state.overlay.kind : "table" } };
    case "back":
      return event.expected === state && state.overlay.kind === "handReplay" && state.overlay.origin !== "table"
        ? { ...state, overlay: { kind: state.overlay.origin } } : state;
    case "close": return event.expected === state ? initialOverlayNavigation(state.gameId) : state;
    case "reconcile": {
      if (event.gameId !== state.gameId) return initialOverlayNavigation(event.gameId);
      const { overlay } = state;
      if ((overlay.kind === "join" && !event.eligibility.isSpectator) ||
        (overlay.kind === "botInformation" && (!event.eligibility.botInformationAvailable || !event.eligibility.botIds.includes(overlay.botId)))) {
        return initialOverlayNavigation(state.gameId);
      }
      return state;
    }
  }
}
