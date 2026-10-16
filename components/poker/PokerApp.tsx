"use client";
import { connectionFeedback } from "./connection-notice";
import { useCreation } from "@/components/creation/useCreation";
import { CreationFeedback } from "@/components/creation/CreationFeedback";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { headerDepartureSeat } from "./header-navigation";
import { HandReplayModal } from "./HandReplayModal";
import { Modal } from "./Modal";
import { turnRemainingMs } from "./turn-clock";
import Link from "next/link";

import { hasAutomaticTurn } from "./bot-advancement";
import { useSettings } from "./useSettings";
import { BotInformationModal } from "./BotInformationModal";
import { selectedBot } from "./bot-information";
import { SettingsModal } from "./SettingsModal";
import { useTurnNotifications } from "./useTurnNotifications";
import { TableLoadingIndicator } from "./TableLoadingShell";
import loadingStyles from "./TableLoadingShell.module.css";
import { GameHeader } from "./GameHeader";
import { addLocalePrefix } from "@/lib/i18n";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  ActionFeedModal,
  ActionFeedPanel,
} from "@/components/poker/ActionFeedPanel";
import { Button } from "@/components/Button";
import { useI18n } from "@/components/poker/I18nProvider";
import { LobbyPanel } from "@/components/poker/LobbyPanel";
import { PokerTable } from "@/components/poker/PokerTable";
import styles from "@/components/poker/PokerApp.module.css";
import { useGameSession } from "@/components/poker/useGameSession";
import { getClientPlayerToken } from "@/lib/identity/player-token-client";
import {
  arrangeSeats,
  arrangeSeatsLinear,
  resolveViewer,
  latestActionsForStreet,
  tableFlow,
  canAdvanceBots,
} from "@/components/poker/view-model";

import { adjustTarget, decisionScope, validatedTarget } from "@/components/poker/bet-sizing";

import { usePlayerName } from "@/lib/browser/player-name";
import { useActionsPreference } from "./useActionsPreference";

export default function PokerApp({ gameId, helpContent, helpTitle }: {
  readonly gameId?: string;
  readonly helpContent: ReactNode;
  readonly helpTitle: string;
}) {
  const { locale, t } = useI18n();
  const creationLabels = {
    wait: t("creation.wait"), creating: t("creation.creating"), retry: t("creation.retry"), recovery: t("creation.recovery"), memoryOnly: t("creation.memoryOnly"),
    cookiesRequired: t("creation.cookiesRequired"), identityChanged: t("creation.identityChanged"), failed: t("creation.failed"),
    unavailable: t("creation.unavailable"), denied: t("creation.denied"), dismiss: t("creation.dismiss"),
  };
  const creation = useCreation(locale, creationLabels);
  const settings = useSettings();
  const shortcuts = settings.ready && settings.preferences.gameplayShortcuts;
  const [languageNavigating, setLanguageNavigating] = useState(false);
  const replayPending = useRef(false);
  const [requestReplaying, setReplaying] = useState(false);
  const replaying = requestReplaying || creation.working;
  const preferredName = usePlayerName();
  const [playerName, setPlayerName] = useState("");
  const [playerNameEdited, setPlayerNameEdited] = useState(false);
  const [amountDraft, setAmountDraft] = useState({ scope: "", value: "" });
  const [overlay, setOverlay] = useState<"none" | "actions" | "join" | "help" | "settings" | "leave" | { botId: string } | { handNumber: number; fromActions: boolean } >("none");
  const [overlayGameId, setOverlayGameId] = useState(gameId);
  if (overlayGameId !== gameId) {
    setOverlayGameId(gameId);
    setOverlay("none");
  }
  const actionsPosition = useRef<number | null>(null);
  const openBot = (botId: string, opener: HTMLButtonElement) => { openerRef.current = opener; setOverlay({ botId }); };
  const reviewHand = (handNumber: number, opener: HTMLButtonElement) => {
    if (overlay !== "actions") openerRef.current = opener;
    setOverlay({ handNumber, fromActions: overlay === "actions" });
  };
  const [departureAttempted, setDepartureAttempted] = useState(false);
  const [departureFailed, setDepartureFailed] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const settingsOpenerRef = useRef<HTMLButtonElement>(null);
  const helpCloseRef = useRef<HTMLButtonElement>(null);
  const helpOpenerRef = useRef<HTMLButtonElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const joinPending = useRef(false);
  const openOverlay = (next: "actions" | "join" | "help" | "settings" | "leave", opener: HTMLElement) => {
    openerRef.current = opener;
    setOverlay(next);
  };
  const { collapsed: feedCollapsed, change: setFeedCollapsed, toggle: toggleFeedCollapsed } = useActionsPreference();

  const toggleFeed = (opener: HTMLButtonElement) => {
    if (window.matchMedia("(max-width: 900px)").matches) {
      const next = overlay !== "actions";
      if (next) { actionsPosition.current = null; openOverlay("actions", opener); }
      else setOverlay("none");
      setFeedCollapsed(!next);
      return;
    }
    toggleFeedCollapsed();
  };

  const closeFeedModal = () => {
    setOverlay("none");
    setFeedCollapsed(true);
  };

  const {
    game,
    unavailable,
    botCatalog,
    feed,
    feedLoading,
    loading,
    navigationLoading,
    requestBusy,
    recoveryBlocked,
    online,
    refreshing,
    refreshGame,
    error,
    botNotice,
    botRetryAvailable,
    connectionNotice,
    claimSeatAt,
    updatePlayerName,
    assignBot,
    releaseSeat,
    startWaitingGame,
    submitAction,
    beginNextHand,
    revealCards,
    retryBotTurn,
    usageLimited,
    usageRetryAfterMs,
    refreshDirectoryState,
  } = useGameSession(gameId);

  const informationPlayer = typeof overlay === "object" && "botId" in overlay ? selectedBot(game?.poker.players ?? [], overlay.botId) : null;
  if (typeof overlay === "object" && "botId" in overlay && (!informationPlayer || unavailable || game?.status === "waiting")) setOverlay("none");

  const feedback = connectionFeedback(connectionNotice, recoveryBlocked);
  const connectionMessage = feedback.message === "none" ? null : t(`connection.${feedback.message}`);

  const viewerToken = getClientPlayerToken();
  const departureSeat = game && !unavailable ? headerDepartureSeat(game.poker.seats ?? game.poker.players, viewerToken) : null;
  const departureRegistered = departureAttempted && !departureSeat && !!game &&
    !(game.poker.seats ?? game.poker.players).some(p => p.controller === "human" && p.status === "claimed" && !p.leaving && p.playerToken === viewerToken);
  const departureFeedback = overlay === "leave" && departureAttempted;

  const { viewerPlayer, human } = resolveViewer(
    game?.poker.players ?? [],
    viewerToken,
  );

  const turnNotification = useTurnNotifications(game, viewerToken, loading || recoveryBlocked || replaying || unavailable, online, settings.preferences.turnSound);

  const canStartNextHand = game ? tableFlow(game.poker.players, game.poker.street, viewerToken, game.viewerIsHost, game.poker.seats).canStartNextHand : false;
  const newQuickPlay = async (botMode?: "rules") => {
    if (loading || replayPending.current || creation.hasPending) return;
    replayPending.current = true;
    setReplaying(true);
    try { await creation.begin({ mode: "quick", botMode, settings: {} }); }
    finally { replayPending.current = false; setReplaying(false); }
  };

  const displayedPlayerName =
    viewerPlayer?.controller === "human" && !playerNameEdited
      ? viewerPlayer.name
      : playerNameEdited ? playerName : preferredName;
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
  const isHumanTurn =
    viewerPlayer !== null &&
    viewerPlayer.controller === "human" &&
    viewerPlayer.status === "claimed" && !viewerPlayer.leaving &&
    game?.poker.currentActorId === viewerPlayer.id;
  const ownedSeat = (game?.poker.seats ?? game?.poker.players ?? []).find(seat =>
    seat.controller === "human" && seat.status === "claimed" && viewerToken !== null && seat.playerToken === viewerToken);
  const isSpectator = viewerPlayer === null && !ownedSeat && Boolean(game);
  if (overlay === "join" && !isSpectator) setOverlay("none");
  const canRevealCards =
    game?.poker.street === "complete" &&
    game.poker.completionReason === "fold" &&
    human?.playerToken === viewerToken &&
    human.holeCards !== null &&
    !human.cardsRevealed;
  const seatRows = arrangeSeats(
    game?.poker.players ?? [],
    viewerPlayer?.id ?? null,
  );
  const linearSeats = arrangeSeatsLinear(
    game?.poker.players ?? [],
    viewerPlayer?.id ?? null,
  );
  const latestActions = latestActionsForStreet(
    feed?.events ?? [],
    game?.poker.players ?? [],
    game?.poker.handNumber ?? 0,
    game?.poker.street ?? null,
  );

  useEffect(() => {
    if (!shortcuts) return;
    function handleShortcut(event: KeyboardEvent) {
      if (overlay !== "none") return;
      const completedHand = game?.poker.street === "complete";

      if (
        !game ||
        (!completedHand && (turnRemainingMs(game) ?? 1) <= 0) ||
        (!isHumanTurn && !canStartNextHand && !(completedHand && canRevealCards)) ||
        loading || replaying || replayPending.current ||
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
        void submitAction(
          action,
          action.type === "call" ? action.amount : null,
        );
        return;
      }

      if (key === "d" && sizedAction && selectedAmount !== null) {
        event.preventDefault();
        void submitAction(
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
    overlay,
    selectedAmount,
    amountScope,
    game,
    beginNextHand,
    canRevealCards,
    canStartNextHand,
    replaying,
    isHumanTurn,
    loading,
    sizedAction,
    submitAction,
    revealCards,
    viewerPlayer,
  ]);

  return (
    <div className={`${styles.cardPalette} ${!game && !unavailable ? loadingStyles.loadingPage : ""}`} data-card-colours={settings.preferences.cardColours}>
    <CreationFeedback creation={creation} labels={creationLabels} />
    <GameHeader helpRef={helpOpenerRef} onHelp={opener => openOverlay("help", opener)} settingsRef={settingsOpenerRef} onSettings={opener => openOverlay("settings", opener)} game={game} mutationsBlocked={recoveryBlocked} loading={navigationLoading || replaying} onLeave={opener => { setDepartureAttempted(false); setDepartureFailed(false); openOverlay("leave", opener); }} />
    <main className={styles.pokerApp}>
      <div className={connectionMessage || (!departureFeedback && (error || feedback.refresh)) || botNotice ? styles.errorBanner : undefined}>
        <div data-testid="connection-status" role="status" aria-live="polite" aria-atomic="true">
          {connectionMessage ? <p>{connectionMessage}</p> : null}
        </div>
      {(!departureFeedback && (error || feedback.refresh)) || botNotice ? (
        <p role={error || botNotice ? "alert" : undefined}>
          {!departureFeedback ? error : null}
          {botNotice ? <span>{botNotice}</span> : null}
          {feedback.refresh && !departureFeedback ? <Button className={styles.recoveryButton} size="small" disabled={!online || refreshing} onClick={refreshGame}>{t("errors.refreshTable")}</Button> : null}
          {usageLimited ? <> <span>{t("errors.retryAvailable", { seconds: Math.ceil(usageRetryAfterMs / 1000) })}</span> <Button size="small" disabled={loading || replaying || creation.hasPending} onClick={() => void newQuickPlay("rules")}>{t("errors.rulesOnlyGame")}</Button></> : null}
          {botNotice && (botRetryAvailable || usageLimited) && !recoveryBlocked && game && canAdvanceBots(game, viewerToken) && hasAutomaticTurn(game) ? (
            <Button
              size="small"
              disabled={loading || replaying || usageRetryAfterMs > 0}
              onClick={() => { if (!replayPending.current) void retryBotTurn(); }}
            >
              {t(game?.poker.players.find(player => player.id === game.poker.currentActorId)?.controller === "human"
                ? game.poker.players.find(player => player.id === game.poker.currentActorId)?.leaving ? "gameHeader.retryDeparture" : "timer.retry" : "errors.retryBot")}
            </Button>
          ) : null}
        </p>
      ) : null}
      </div>
      {unavailable ? (
        <Link href={addLocalePrefix("/play", locale)}>{t("gameHeader.lobby")}</Link>
      ) : !game ? (
        <TableLoadingIndicator label={t("table.loading")} />
      ) : game.status === "waiting" ? (
        <LobbyPanel
          busy={requestBusy}
          game={game}
          botCatalog={botCatalog}
          loading={loading}
          playerName={displayedPlayerName}
          setPlayerName={(name) => {
            setPlayerName(name);
            setPlayerNameEdited(true);
          }}
          viewerToken={viewerToken}
          onSavePlayerName={(seat) => {
            void updatePlayerName(seat, displayedPlayerName).then((updated) => {
              if (updated) setPlayerNameEdited(false);
            });
          }}
          onClaimSeatAt={(seat) => {
            void claimSeatAt(seat, displayedPlayerName).then((claimed) => {
              if (claimed) setPlayerNameEdited(false);
            });
          }}
          onAssignBot={(seat, difficulty, botId, botProfileId) =>
            void assignBot(seat, difficulty, botId, botProfileId)
          }
          onReleaseSeat={(seat) => void releaseSeat(seat)}
          onStartWaitingGame={(settings) => void startWaitingGame(settings)}
          onRefresh={refreshDirectoryState}
        />
      ) : (
        <div ref={tableRef} tabIndex={-1} className={styles.gameLayout}>
          <div
            className={`${styles.tableRow} ${feedCollapsed ? styles.feedCollapsed : ""}`}
          >
            <PokerTable
              onReviewHand={opener => reviewHand(game.poker.handNumber, opener)}
              onAboutBot={openBot}
              showCurrentHand={settings.preferences.showCurrentHand}
              shortcuts={shortcuts}
              busy={requestBusy}
              game={game}
              seatRows={seatRows}
              linearSeats={linearSeats}
              human={human}
              viewerToken={viewerToken}
              isSpectator={isSpectator}
              canStartNextHand={canStartNextHand}
              replaying={replaying}
              creationBlocked={creation.hasPending}
              replayError={false}
              onNewQuickPlay={() => void newQuickPlay()}
              isHumanTurn={isHumanTurn}
              sizedAction={sizedAction}
              amount={amount}
              loading={loading || replaying}
              setAmount={setAmount}
              onClaimFirstOpenSeat={(opener) => {
                openOverlay("join", opener);
              }}
              onStandUp={() => {
                if (ownedSeat && !replayPending.current) void releaseSeat(ownedSeat.seat);
              }}
              onSubmitAction={(action, amountOverride = selectedAmount) => {
                if (replayPending.current) return;
                if ((action.type === "bet" || action.type === "raise") && amountOverride === null) return;
                void submitAction(action, amountOverride);
              }}
              onBeginNextHand={() => { if (!replayPending.current) void beginNextHand(); }}
              onRevealCards={() => { if (!replayPending.current) void revealCards(); }}
              feedCollapsed={feedCollapsed}
              onToggleFeed={toggleFeed}
              latestActions={latestActions}
            />
            {feedCollapsed ? null : (
              <div className={styles.feedColumn}>
                <div className={styles.desktopFeed}>
                  <ActionFeedPanel onReviewHand={reviewHand} feed={feed} loading={feedLoading} viewerPlayerId={viewerPlayer?.id ?? null} />
                </div>
              </div>
            )}
          </div>
          {overlay === "actions" ? (
            <ActionFeedModal
              onReviewHand={reviewHand}
              positionRef={actionsPosition}
              viewerPlayerId={viewerPlayer?.id ?? null}
              feed={feed}
              loading={feedLoading}
              onClose={closeFeedModal}
              restoreFocus={openerRef}
              fallbackFocus={tableRef}
            />
          ) : null}
          {overlay === "join" && isSpectator ? (
            <Modal open title={t("table.joinTitle")} onDismiss={() => setOverlay("none")}
              initialFocus={nameRef} restoreFocus={openerRef} fallbackFocus={tableRef}
              className={styles.joinDialog}>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (loading || joinPending.current) return;
                  const openSeat = (game.poker.seats ?? game.poker.players).find(
                    (player) => player.status === "open",
                  );
                  if (!openSeat) {
                    setOverlay("none");
                    return;
                  }
                  joinPending.current = true;
                  void claimSeatAt(openSeat.seat, displayedPlayerName).then(
                    (joined) => {
                      if (joined) {
                        setPlayerNameEdited(false);
                        setOverlay("none");
                      }
                    },
                  ).finally(() => { joinPending.current = false; });
                }}
              >
                <h2 id="join-table-title">{t("table.joinTitle")}</h2>
                <p>{t("table.joinInstructions")}</p>
                <label>
                  <span>{t("lobby.yourName")}</span>
                  <input
                    ref={nameRef}
                    type="text"
                    value={displayedPlayerName}
                    maxLength={30}
                    placeholder={t("lobby.anonymous")}
                    onChange={(event) => {
                      setPlayerName(event.target.value);
                      setPlayerNameEdited(true);
                    }}
                  />
                </label>
                <div className={styles.joinActions}>
                  <Button
                    disabled={loading}
                    onClick={() => setOverlay("none")}
                  >
                    {t("table.joinCancel")}
                  </Button>
                  <Button variant="primary" type="submit" disabled={loading}>
                    {requestBusy ? t("table.claimingSeat") : t("table.joinConfirm")}
                  </Button>
                </div>
              </form>
            </Modal>
          ) : null}
        </div>
      )}
    </main>
    {typeof overlay === "object" && "handNumber" in overlay ? <HandReplayModal key={`${gameId}:${overlay.handNumber}`}
      gameId={game?.id ?? gameId ?? ""} handNumber={overlay.handNumber} game={game} yourTurn={isHumanTurn}
      onClose={() => setOverlay("none")} onBack={overlay.fromActions ? () => setOverlay("actions") : undefined}
      restoreFocus={openerRef} fallbackFocus={helpOpenerRef} /> : null}
    {typeof overlay === "object" && informationPlayer && !unavailable && game?.status !== "waiting" ? (
      <BotInformationModal player={informationPlayer} onClose={() => setOverlay("none")}
        restoreFocus={openerRef} fallbackFocus={helpOpenerRef} />
    ) : null}
    {overlay === "leave" ? <ConfirmationDialog
      title={t("gameHeader.leaveTable")}
      explanation={!departureSeat ? t(departureRegistered ? "gameHeader.departureRegistered" : "gameHeader.departureUnavailable") :
        `${t(game?.status === "waiting" ? "gameHeader.confirmWaiting" : game?.status === "complete" ? "gameHeader.confirmComplete" : "gameHeader.confirmDeparture")}${game?.status === "playing" ? ` ${t("gameHeader.allInDeparture")}` : ""}`}
      cancelLabel={t("gameHeader.cancel")} confirmLabel={t("gameHeader.leaveTable")} pendingLabel={t("gameHeader.leaving")}
      feedback={departureAttempted && departureSeat ? error ?? (departureFailed ? t("gameHeader.departureFailed") : null) : null}
      blocked={!departureSeat || loading || recoveryBlocked || unavailable}
      onClose={() => setOverlay("none")} restoreFocus={openerRef} fallbackFocus={helpOpenerRef}
      onConfirm={async () => {
        // Read the current render's authoritative assignment, never the opening seat.
        if (!departureSeat || loading || recoveryBlocked || unavailable) return;
        setDepartureAttempted(true); setDepartureFailed(false);
        const acknowledged = await releaseSeat(departureSeat.seat, true);
        if (!acknowledged) setDepartureFailed(true);
      }}>
      {!departureSeat && !navigationLoading ? <Link href={addLocalePrefix("/play", locale)}>{t("gameHeader.lobby")}</Link> : null}
      {departureAttempted && feedback.refresh ? <Button disabled={!online || refreshing} onClick={refreshGame}>{t("errors.refreshTable")}</Button> : null}
    </ConfirmationDialog> : null}
    {overlay === "settings" ? (
      <SettingsModal preferences={settings.preferences} onUpdate={settings.update}
        onSound={turnNotification.preview} notice={turnNotification.notice}
        languageBlocked={loading || recoveryBlocked || replaying || languageNavigating || unavailable || !game}
        onNavigate={() => setLanguageNavigating(true)} gameId={game?.id ?? gameId ?? ""}
        onClose={() => setOverlay("none")} restoreFocus={openerRef} fallbackFocus={settingsOpenerRef} />
    ) : null}
    {overlay === "help" ? (
      <Modal open title={helpTitle} onDismiss={() => setOverlay("none")}
        initialFocus={helpCloseRef} restoreFocus={openerRef} fallbackFocus={helpOpenerRef}
        className={styles.helpDialog}>
        <div className={styles.helpHeader}>
          <h2>{helpTitle}</h2>
          <Button ref={helpCloseRef} size="small" onClick={() => setOverlay("none")}>
            {t("gameHeader.closeHelp")}
          </Button>
        </div>
        <div className={styles.helpScroll} tabIndex={0}>{helpContent}</div>
      </Modal>
    ) : null}
    </div>
  );
}
