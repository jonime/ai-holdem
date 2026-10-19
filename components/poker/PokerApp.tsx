"use client";
import { useGameOverlay } from "./useGameOverlay";
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
  const quickPlayCreationPending = useRef(false);
  const [requestCreatingQuickPlay, setCreatingQuickPlay] = useState(false);
  const creatingQuickPlay = requestCreatingQuickPlay || creation.working;
  const preferredName = usePlayerName();
  const [playerName, setPlayerName] = useState("");
  const [playerNameEdited, setPlayerNameEdited] = useState(false);
  const [amountDraft, setAmountDraft] = useState({ scope: "", value: "" });
  const [departureAttempted, setDepartureAttempted] = useState(false);
  const [departureFailed, setDepartureFailed] = useState(false);
  const settingsOpenerRef = useRef<HTMLButtonElement>(null);
  const helpCloseRef = useRef<HTMLButtonElement>(null);
  const helpOpenerRef = useRef<HTMLButtonElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const joinPending = useRef(false);
  const { collapsed: feedCollapsed, change: setFeedCollapsed, toggle: toggleFeedCollapsed } = useActionsPreference();

  const toggleFeed = (opener: HTMLButtonElement) => {
    if (window.matchMedia("(max-width: 900px)").matches) {
      const next = overlay.kind !== "actions";
      if (next) { openActions(opener); }
      else closeOverlay();
      setFeedCollapsed(!next);
      return;
    }
    toggleFeedCollapsed();
  };

  const closeFeedModal = () => {
    closeOverlay();
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

  const feedback = connectionFeedback(connectionNotice, recoveryBlocked);
  const connectionMessage = feedback.message === "none" ? null : t(`connection.${feedback.message}`);

  const viewerToken = getClientPlayerToken();
  const departureSeat = game && !unavailable ? headerDepartureSeat(game.poker.seats ?? game.poker.players, viewerToken) : null;
  const departureRegistered = departureAttempted && !departureSeat && !!game &&
    !(game.poker.seats ?? game.poker.players).some(p => p.controller === "human" && p.status === "claimed" && !p.leaving && p.playerToken === viewerToken);

  const { viewerPlayer, human } = resolveViewer(
    game?.poker.players ?? [],
    viewerToken,
  );

  const turnNotification = useTurnNotifications(game, viewerToken, loading || recoveryBlocked || creatingQuickPlay || unavailable, online, settings.preferences.turnSound);

  const canStartNextHand = game ? tableFlow(game.poker.players, game.poker.street, viewerToken, game.viewerIsHost, game.poker.seats).canStartNextHand : false;
  const newQuickPlay = async (botMode?: "rules") => {
    if (loading || quickPlayCreationPending.current || creation.hasPending) return;
    quickPlayCreationPending.current = true;
    setCreatingQuickPlay(true);
    try { await creation.begin({ mode: "quick", botMode, settings: {} }); }
    finally { quickPlayCreationPending.current = false; setCreatingQuickPlay(false); }
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
  const {
    overlay, isOverlayOpen, openerRef, actionsPosition, close: closeOverlay,
    openActions, openJoin, openHelp, openSettings, openLeave,
    openBotInformation: openBot, openReplay: reviewHand, backToActions,
  } = useGameOverlay(gameId, {
    isSpectator,
    botInformationAvailable: !unavailable && game?.status !== "waiting",
    botIds: (game?.poker.players ?? []).filter(player => player.controller === "bot" && player.status !== "open").map(player => player.id),
  });
  const informationPlayer = overlay.kind === "botInformation" ? selectedBot(game?.poker.players ?? [], overlay.botId) : null;
  const departureFeedback = overlay.kind === "leave" && departureAttempted;
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
    submitAction,
    revealCards,
    viewerPlayer,
  ]);

  return (
    <div className={`${styles.cardPalette} ${!game && !unavailable ? loadingStyles.loadingPage : ""}`} data-card-colours={settings.preferences.cardColours}>
    <CreationFeedback creation={creation} labels={creationLabels} />
    <GameHeader helpRef={helpOpenerRef} onHelp={opener => openHelp(opener)} settingsRef={settingsOpenerRef} onSettings={opener => openSettings(opener)} game={game} mutationsBlocked={recoveryBlocked} loading={navigationLoading || creatingQuickPlay} onLeave={opener => { setDepartureAttempted(false); setDepartureFailed(false); openLeave(opener); }} />
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
          {usageLimited ? <> <span>{t("errors.retryAvailable", { seconds: Math.ceil(usageRetryAfterMs / 1000) })}</span> <Button size="small" disabled={loading || creatingQuickPlay || creation.hasPending} onClick={() => void newQuickPlay("rules")}>{t("errors.rulesOnlyGame")}</Button></> : null}
          {botNotice && (botRetryAvailable || usageLimited) && !recoveryBlocked && game && canAdvanceBots(game, viewerToken) && hasAutomaticTurn(game) ? (
            <Button
              size="small"
              disabled={loading || creatingQuickPlay || usageRetryAfterMs > 0}
              onClick={() => { if (!quickPlayCreationPending.current) void retryBotTurn(); }}
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
              creatingQuickPlay={creatingQuickPlay}
              creationBlocked={creation.hasPending}
              quickPlayCreationError={false}
              onNewQuickPlay={() => void newQuickPlay()}
              isHumanTurn={isHumanTurn}
              sizedAction={sizedAction}
              amount={amount}
              loading={loading || creatingQuickPlay}
              setAmount={setAmount}
              onClaimFirstOpenSeat={(opener) => {
                openJoin(opener);
              }}
              onStandUp={() => {
                if (ownedSeat && !quickPlayCreationPending.current) void releaseSeat(ownedSeat.seat);
              }}
              onSubmitAction={(action, amountOverride = selectedAmount) => {
                if (quickPlayCreationPending.current) return;
                if ((action.type === "bet" || action.type === "raise") && amountOverride === null) return;
                void submitAction(action, amountOverride);
              }}
              onBeginNextHand={() => { if (!quickPlayCreationPending.current) void beginNextHand(); }}
              onRevealCards={() => { if (!quickPlayCreationPending.current) void revealCards(); }}
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
          {overlay.kind === "actions" ? (
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
          {overlay.kind === "join" && isSpectator ? (
            <Modal open title={t("table.joinTitle")} onDismiss={closeOverlay}
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
                    closeOverlay();
                    return;
                  }
                  joinPending.current = true;
                  void claimSeatAt(openSeat.seat, displayedPlayerName).then(
                    (joined) => {
                      if (joined) {
                        setPlayerNameEdited(false);
                        closeOverlay();
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
                    onClick={closeOverlay}
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
    {overlay.kind === "handReplay" ? <HandReplayModal key={`${gameId}:${overlay.handNumber}`}
      gameId={game?.id ?? gameId ?? ""} handNumber={overlay.handNumber} game={game} yourTurn={isHumanTurn}
      onClose={closeOverlay} onBack={backToActions}
      restoreFocus={openerRef} fallbackFocus={helpOpenerRef} /> : null}
    {overlay.kind === "botInformation" && informationPlayer && !unavailable && game?.status !== "waiting" ? (
      <BotInformationModal player={informationPlayer} onClose={closeOverlay}
        restoreFocus={openerRef} fallbackFocus={helpOpenerRef} />
    ) : null}
    {overlay.kind === "leave" ? <ConfirmationDialog
      title={t("gameHeader.leaveTable")}
      explanation={!departureSeat ? t(departureRegistered ? "gameHeader.departureRegistered" : "gameHeader.departureUnavailable") :
        `${t(game?.status === "waiting" ? "gameHeader.confirmWaiting" : game?.status === "complete" ? "gameHeader.confirmComplete" : "gameHeader.confirmDeparture")}${game?.status === "playing" ? ` ${t("gameHeader.allInDeparture")}` : ""}`}
      cancelLabel={t("gameHeader.cancel")} confirmLabel={t("gameHeader.leaveTable")} pendingLabel={t("gameHeader.leaving")}
      feedback={departureAttempted && departureSeat ? error ?? (departureFailed ? t("gameHeader.departureFailed") : null) : null}
      blocked={!departureSeat || loading || recoveryBlocked || unavailable}
      onClose={closeOverlay} restoreFocus={openerRef} fallbackFocus={helpOpenerRef}
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
    {overlay.kind === "settings" ? (
      <SettingsModal preferences={settings.preferences} onUpdate={settings.update}
        onSound={turnNotification.preview} notice={turnNotification.notice}
        languageBlocked={loading || recoveryBlocked || creatingQuickPlay || languageNavigating || unavailable || !game}
        onNavigate={() => setLanguageNavigating(true)} destination={`/game/${game?.id ?? gameId ?? ""}${typeof window === "undefined" ? "" : window.location.search + window.location.hash}`}
        onClose={closeOverlay} restoreFocus={openerRef} fallbackFocus={settingsOpenerRef} />
    ) : null}
    {overlay.kind === "help" ? (
      <Modal open title={helpTitle} onDismiss={closeOverlay}
        initialFocus={helpCloseRef} restoreFocus={openerRef} fallbackFocus={helpOpenerRef}
        className={styles.helpDialog}>
        <div className={styles.helpHeader}>
          <h2>{helpTitle}</h2>
          <Button ref={helpCloseRef} size="small" onClick={closeOverlay}>
            {t("gameHeader.closeHelp")}
          </Button>
        </div>
        <div className={styles.helpScroll} tabIndex={0}>{helpContent}</div>
      </Modal>
    ) : null}
    </div>
  );
}
