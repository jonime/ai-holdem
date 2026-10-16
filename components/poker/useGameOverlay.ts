"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { canReturnToActions, initialOverlayNavigation, transitionOverlay, type GameOverlay, type OverlayEligibility } from "./game-overlay";

export function useGameOverlay(gameId: string | undefined, eligibility: OverlayEligibility) {
  const [stored, setNavigation] = useState(() => initialOverlayNavigation(gameId));
  const navigation = transitionOverlay(stored, { type: "reconcile", gameId, eligibility });
  if (navigation !== stored) setNavigation(navigation);

  const openerRef = useRef<HTMLElement | null>(null);
  const actionsPosition = useRef<number | null>(null);
  useLayoutEffect(() => {
    openerRef.current = null;
    actionsPosition.current = null;
  }, [gameId]);
  // Closures capture the navigation object as an instance token. The pure
  // transition rejects completion from a replaced, closed, or previous-game dialog.
  const close = () => setNavigation(current => transitionOverlay(current, { type: "close", expected: navigation }));
  const backToActions = canReturnToActions(navigation.overlay)
    ? () => setNavigation(current => transitionOverlay(current, { type: "back", expected: navigation }))
    : undefined;
  const open = (overlay: Exclude<GameOverlay, { kind: "none" | "handReplay" }>, opener: HTMLElement) => {
    openerRef.current = opener;
    actionsPosition.current = null;
    setNavigation(current => transitionOverlay(current, { type: "open", overlay }));
  };
  const openReplay = (handNumber: number, opener: HTMLButtonElement) => {
    if (navigation.overlay.kind !== "actions") {
      openerRef.current = opener;
      actionsPosition.current = null;
    }
    setNavigation(current => transitionOverlay(current, { type: "replay", handNumber }));
  };
  return {
    overlay: navigation.overlay, isOverlayOpen: navigation.overlay.kind !== "none",
    openerRef, actionsPosition, close, backToActions, openReplay,
    openActions: (opener: HTMLElement) => open({ kind: "actions" }, opener),
    openJoin: (opener: HTMLElement) => open({ kind: "join" }, opener),
    openHelp: (opener: HTMLElement) => open({ kind: "help" }, opener),
    openSettings: (opener: HTMLElement) => open({ kind: "settings" }, opener),
    openLeave: (opener: HTMLElement) => open({ kind: "leave" }, opener),
    openBotInformation: (botId: string, opener: HTMLButtonElement) => open({ kind: "botInformation", botId }, opener),
  };
}
