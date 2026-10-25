"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { adjustTarget, decisionScope, validatedTarget } from "./bet-sizing";
import { foldDecision, sameFoldDecision, type FoldDecision } from "./fold-confirmation";
import type { GameOverlay } from "./game-overlay";
import { turnRemainingMs } from "./turn-clock";
import type { Game, LegalAction } from "./types";
import { resolveViewer } from "./view-model";

interface PlayerControlsOptions {
  readonly game: Game | null;
  readonly viewerToken: string | null;
  // Fold decisions re-read browser identity at intent/reconciliation time.
  readonly readViewerToken: () => string | null;
  readonly actionsBlocked: boolean;
  readonly loading: boolean;
  readonly creatingQuickPlay: boolean;
  readonly quickPlayCreationPending: RefObject<boolean>;
  readonly shortcuts: boolean;
  readonly overlay: GameOverlay;
  readonly canStartNextHand: boolean;
  readonly tableRef: RefObject<HTMLElement | null>;
  readonly openFoldConfirmation: (decision: FoldDecision, opener: HTMLElement) => void;
  readonly closeOverlay: () => void;
  readonly submitAction: (action: LegalAction, amount?: number | null) => unknown;
  readonly beginNextHand: () => unknown;
  readonly revealCards: () => unknown;
}

/** Local decision interactions only; session callbacks retain mutation and recovery ownership. */
export function usePlayerControls({
  game, viewerToken, readViewerToken, actionsBlocked, loading, creatingQuickPlay,
  quickPlayCreationPending, shortcuts, overlay, canStartNextHand, tableRef,
  openFoldConfirmation, closeOverlay, submitAction, beginNextHand, revealCards,
}: PlayerControlsOptions) {
  const [amountDraft, setAmountDraft] = useState({ scope: "", value: "" });
  const { viewerPlayer, human } = resolveViewer(game?.poker.players ?? [], viewerToken);
  const isHumanTurn =
    viewerPlayer !== null &&
    viewerPlayer.controller === "human" &&
    viewerPlayer.status === "claimed" && !viewerPlayer.leaving &&
    game?.poker.currentActorId === viewerPlayer.id;
  const isOverlayOpen = overlay.kind !== "none";
  const sizedAction = game?.poker.legalActions.find(
    (
      action,
    ): action is Extract<
      (typeof game)["poker"]["legalActions"][number],
      { type: "bet" | "raise" }
    > => action.type === "bet" || action.type === "raise",
  );
  const amountScope = decisionScope(game?.id, game?.version, viewerPlayer?.id);
  const defaultAmount = String(sizedAction?.minAmount ?? "");
  // Adjust during render so a changed authoritative context cannot expose an old draft.
  if (amountDraft.scope !== amountScope) {
    setAmountDraft({ scope: amountScope, value: defaultAmount });
  }
  const amount = amountDraft.scope === amountScope ? amountDraft.value : defaultAmount;
  const selectedAmount = validatedTarget(amount, sizedAction);
  const setAmount = (value: string) => {
    setAmountDraft({ scope: amountScope, value });
  };
  const handleActionIntent = useCallback((action: LegalAction, amountOverride: number | null = selectedAmount, opener?: HTMLElement) => {
    if (!game || actionsBlocked || quickPlayCreationPending.current || !isHumanTurn ||
      (turnRemainingMs(game) ?? 1) <= 0 || isOverlayOpen) return;
    const current = game.poker.legalActions.find(candidate => candidate.type === action.type);
    if (!current || ((current.type === "bet" || current.type === "raise") && amountOverride === null)) return;
    const decision = foldDecision(game, readViewerToken(), actionsBlocked);
    if (current.type === "fold" && game.poker.legalActions.some(candidate => candidate.type === "check")) {
      if (!decision) return;
      const returnTarget = opener ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement : tableRef.current);
      if (!returnTarget) return;
      openFoldConfirmation(decision, returnTarget);
      return;
    }
    void submitAction(current, amountOverride);
  }, [game, actionsBlocked, isHumanTurn, isOverlayOpen, selectedAmount, openFoldConfirmation, submitAction, readViewerToken, quickPlayCreationPending, tableRef]);

  // Authoritative replacements with the same decision remain valid. Deadline expiry
  // also closes the dialog when no response arrives, without pausing the live game.
  useEffect(() => {
    if (overlay.kind !== "foldConfirmation") return;
    const reconcile = () => {
      if (!sameFoldDecision(overlay.decision, foldDecision(game, readViewerToken(), actionsBlocked))) closeOverlay();
    };
    reconcile();
    const timer = setInterval(reconcile, 100);
    return () => clearInterval(timer);
  }, [overlay, game, actionsBlocked, closeOverlay, readViewerToken]);

  const canRevealCards =
    game?.poker.street === "complete" &&
    game.poker.completionReason === "fold" &&
    human?.playerToken === viewerToken &&
    human.holeCards !== null &&
    !human.cardsRevealed;

  useEffect(() => {
    if (!shortcuts) return;
    function handleShortcut(event: KeyboardEvent) {
      if (isOverlayOpen) return;
      const completedHand = game?.poker.street === "complete";

      if (
        !game ||
        (!completedHand && (turnRemainingMs(game) ?? 1) <= 0) ||
        (!isHumanTurn && !canStartNextHand && !(completedHand && canRevealCards)) ||
        loading || creatingQuickPlay || quickPlayCreationPending.current ||
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        ((target instanceof HTMLInputElement && target.type !== "range") ||
          ["TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (target instanceof HTMLElement && target.closest("button, a") &&
        ["enter", " "].includes(key)) return;
      if (canStartNextHand && ["s", "enter", " "].includes(key)) {
        event.preventDefault();
        void beginNextHand();
        return;
      }

      if (completedHand) {
        if (key === "d" && canRevealCards) {
          event.preventDefault();
          void revealCards();
        }
        return;
      }

      const actionByKey = {
        a: game.poker.legalActions.find((action) => action.type === "fold"),
        s: game.poker.legalActions.find(
          (action) => action.type === "check" || action.type === "call",
        ),
      };
      const action = key === "a" || key === "s" ? actionByKey[key] : null;

      if (action) {
        event.preventDefault();
        handleActionIntent(
          action,
          action.type === "call" ? action.amount : null,
        );
        return;
      }

      if (key === "d" && sizedAction && selectedAmount !== null) {
        event.preventDefault();
        handleActionIntent(
          sizedAction,
          selectedAmount,
        );
        return;
      }

      if (
        (key === "q" ||
          key === "e" ||
          key === "arrowleft" ||
          key === "arrowright") &&
        sizedAction
      ) {
        event.preventDefault();
        const direction = key === "q" || key === "arrowleft" ? -1 : 1;
        setAmountDraft({
          scope: amountScope,
          value: String(adjustTarget(sizedAction, selectedAmount, game.poker.bigBlind, direction, event.shiftKey)),
        });
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    shortcuts,
    isOverlayOpen,
    selectedAmount,
    amountScope,
    game,
    beginNextHand,
    canRevealCards,
    canStartNextHand,
    creatingQuickPlay,
    isHumanTurn,
    loading,
    sizedAction,
    handleActionIntent,
    revealCards,
    quickPlayCreationPending,
  ]);

  return { amount, selectedAmount, sizedAction, setAmount, handleActionIntent, isHumanTurn };
}
