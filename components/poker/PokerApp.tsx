"use client";
import { AmountDisplayProvider } from "./AmountDisplay";
import { GameErrorDetails } from "@/components/CopyErrorDetails";
import { useGameOverlay } from "./useGameOverlay";
import { connectionFeedback } from "./connection-notice";
import { useCreation } from "@/components/creation/useCreation";
import { CreationFeedback } from "@/components/creation/CreationFeedback";
import { FoldConfirmationDialog } from "./FoldConfirmationDialog";
import { foldDecision, sameFoldDecision } from "./fold-confirmation";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { headerDepartureSeat } from "./header-navigation";
import { HandReplayModal } from "./HandReplayModal";
import { ShareTableModal } from "./ShareTableModal";
import { Modal } from "./Modal";
import { ModalTurnProvider } from "./ModalTurnWarning";
import Link from "next/link";

import { hasAutomaticTurn } from "./bot-advancement";
import { useSettings } from "./useSettings";
import { BotInformationModal } from "./BotInformationModal";
import { selectedBot } from "./bot-information";
import { SettingsModal } from "./SettingsModal";
import { useHandAnnouncements } from "./useHandAnnouncements";
import { useTurnNotifications } from "./useTurnNotifications";
import { TableLoadingIndicator } from "./TableLoadingShell";
import loadingStyles from "./TableLoadingShell.module.css";
import { HelpModal } from "./HelpModal";
import { GameHeader } from "./GameHeader";
import { addLocalePrefix } from "@/lib/i18n";

import { useRef, useState, type ReactNode } from "react";

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

import { usePlayerControls } from "./usePlayerControls";

import { usePlayerName } from "@/lib/browser/player-name";
import { PersonalResultsModal } from "./PersonalResultsModal";
import { useActionsPreference } from "./useActionsPreference";

export default function PokerApp({ gameId, helpContent, helpTitle }: {
  readonly gameId?: string;
  readonly helpContent: ReactNode;
  readonly helpTitle: string;
}) {
  const { locale, t } = useI18n();
  const creationLabels = {
    copyDetails: t("creation.copyDetails"), copySuccess: t("creation.copySuccess"), copyFallback: t("creation.copyFallback"),
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
  const [departureAttempted, setDepartureAttempted] = useState(false);
  const [departureFailed, setDepartureFailed] = useState(false);
  const settingsOpenerRef = useRef<HTMLButtonElement>(null);
  const helpOpenerRef = useRef<HTMLButtonElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const joinPending = useRef(false);
  const { collapsed: feedCollapsed, change: setFeedCollapsed, toggle: toggleFeedCollapsed } = useActionsPreference();

  const toggleFeed = (opener: HTMLButtonElement) => {
    if (window.matchMedia("(max-width: 1099px)").matches) {
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
    authoritativeRevision,
    game,
    unavailable,
    botCatalog,
    feed,
    feedLoading,
    loading,
    navigationLoading,
    requestBusy,
    recoveryBlocked,
    diagnostics,
    botDiagnostics,
    readDiagnostics,
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

  useHandAnnouncements(gameId, game, viewerToken, authoritativeRevision, loading || recoveryBlocked || creatingQuickPlay || unavailable, online, settings.preferences.amountDisplay);
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
  const ownedSeat = (game?.poker.seats ?? game?.poker.players ?? []).find(seat =>
    seat.controller === "human" && seat.status === "claimed" && viewerToken !== null && seat.playerToken === viewerToken);
  const isSpectator = viewerPlayer === null && !ownedSeat && Boolean(game);
  const {
    overlay, openerRef, actionsPosition, close: closeOverlay,
    openFoldConfirmation, openActions, openResults, openJoin, openHelp, openShareTable, openSettings, openLeave,
    openBotInformation: openBot, openReplay: reviewHand, backToActions, backToResults,
  } = useGameOverlay(gameId, {
    isSpectator,
    botInformationAvailable: !unavailable && game?.status !== "waiting",
    botIds: (game?.poker.players ?? []).filter(player => player.controller === "bot" && player.status !== "open").map(player => player.id),
  });
  const actionsBlocked = loading || requestBusy || recoveryBlocked || unavailable || !online ||
    creatingQuickPlay || languageNavigating || game?.id !== gameId;
  const { amount, sizedAction, setAmount, handleActionIntent, isHumanTurn } = usePlayerControls({
    game, viewerToken, readViewerToken: getClientPlayerToken, actionsBlocked, loading,
    creatingQuickPlay, quickPlayCreationPending, shortcuts, overlay, canStartNextHand,
    tableRef, openFoldConfirmation, closeOverlay, submitAction, beginNextHand, revealCards,
  });

  const informationPlayer = overlay.kind === "botInformation" ? selectedBot(game?.poker.players ?? [], overlay.botId) : null;
  const departureFeedback = overlay.kind === "leave" && departureAttempted;
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

  return (
    <AmountDisplayProvider value={{ mode: settings.preferences.amountDisplay, bigBlind: game?.poker.bigBlind }}>
    <ModalTurnProvider game={game} yourTurn={isHumanTurn && !unavailable}>
    <div className={`${styles.cardPalette} ${!game && !unavailable ? loadingStyles.loadingPage : ""}`} data-card-colours={settings.preferences.cardColours}>
    <CreationFeedback creation={creation} labels={creationLabels} />
    <GameHeader onShareTable={openShareTable} helpRef={helpOpenerRef} onHelp={opener => openHelp(opener)} settingsRef={settingsOpenerRef} onSettings={opener => openSettings(opener)} game={game} mutationsBlocked={recoveryBlocked} loading={navigationLoading || creatingQuickPlay} onLeave={opener => { setDepartureAttempted(false); setDepartureFailed(false); openLeave(opener); }} />
    <main className={styles.pokerApp}>
      <div className={connectionMessage || (!departureFeedback && (error || feedback.refresh)) || botNotice ? styles.errorBanner : undefined}>
        <div data-testid="connection-status" role="status" aria-live="polite" aria-atomic="true">
          {connectionMessage ? <p>{connectionMessage}{!error && !botNotice && connectionNotice === "refreshFailed" ? <GameErrorDetails report={readDiagnostics} /> : null}</p> : null}
        </div>
      {(!departureFeedback && (error || feedback.refresh)) || botNotice ? (
        <p role={error || botNotice ? "alert" : undefined}>
          {!departureFeedback ? error : null}
          {!departureFeedback && error ? <GameErrorDetails report={diagnostics} /> : null}
          {botNotice ? <span>{botNotice}</span> : null}
          {botNotice ? <GameErrorDetails report={botDiagnostics} /> : null}
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
          onShareTable={openShareTable}
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
              onSubmitAction={handleActionIntent}
              onBeginNextHand={() => { if (!quickPlayCreationPending.current) void beginNextHand(); }}
              onRevealCards={() => { if (!quickPlayCreationPending.current) void revealCards(); }}
              feedCollapsed={feedCollapsed}
              onToggleFeed={toggleFeed}
              onResults={openResults}
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
    {overlay.kind === "results" || overlay.kind === "handReplay" && overlay.origin === "results" ? <PersonalResultsModal
      key={gameId} gameId={game?.id ?? gameId ?? ""} game={game}
      active={overlay.kind === "results"} onClose={closeOverlay} onReview={reviewHand}
      restoreFocus={openerRef} fallbackFocus={tableRef} /> : null}
    {overlay.kind === "handReplay" ? <HandReplayModal key={`${gameId}:${overlay.handNumber}`}
      gameId={game?.id ?? gameId ?? ""} handNumber={overlay.handNumber}
      onClose={backToResults ?? closeOverlay} onBack={backToActions}
      restoreFocus={openerRef} fallbackFocus={helpOpenerRef} /> : null}
    {overlay.kind === "botInformation" && informationPlayer && !unavailable && game?.status !== "waiting" ? (
      <BotInformationModal player={informationPlayer} onClose={closeOverlay}
        restoreFocus={openerRef} fallbackFocus={helpOpenerRef} />
    ) : null}
    {overlay.kind === "foldConfirmation" ? <FoldConfirmationDialog
      onClose={closeOverlay} restoreFocus={openerRef} fallbackFocus={tableRef}
      onAction={type => {
        const valid = sameFoldDecision(overlay.decision,
          foldDecision(game, getClientPlayerToken(), actionsBlocked || quickPlayCreationPending.current));
        const action = valid ? game?.poker.legalActions.find(candidate => candidate.type === type) : undefined;
        closeOverlay();
        if (action) void submitAction(action);
      }} /> : null}
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
      {departureAttempted && error ? <GameErrorDetails report={diagnostics} /> : null}
      {departureAttempted && feedback.refresh ? <Button disabled={!online || refreshing} onClick={refreshGame}>{t("errors.refreshTable")}</Button> : null}
    </ConfirmationDialog> : null}
    {overlay.kind === "shareTable" && game && !unavailable ? <ShareTableModal key={game.id}
      game={game} onClose={closeOverlay}
      restoreFocus={openerRef} fallbackFocus={helpOpenerRef} /> : null}
    {overlay.kind === "settings" ? (
      // The fixed /game/ path and validated game UUID keep query/fragment input in URL suffixes.
      <SettingsModal preferences={settings.preferences} onUpdate={settings.update}
        onSound={turnNotification.preview} notice={turnNotification.notice}
        languageBlocked={loading || recoveryBlocked || creatingQuickPlay || languageNavigating || unavailable || !game}
        onNavigate={() => setLanguageNavigating(true)} destination={`/game/${game?.id ?? gameId ?? ""}${typeof window === "undefined" ? "" : window.location.search + window.location.hash}`}
        onClose={closeOverlay} restoreFocus={openerRef} fallbackFocus={settingsOpenerRef} />
    ) : null}
    {overlay.kind === "help" ? (
      <HelpModal title={helpTitle} content={helpContent} closeLabel={t("settings.close")} onClose={closeOverlay}
        restoreFocus={openerRef} fallbackFocus={helpOpenerRef} />
    ) : null}
    </div>
    </ModalTurnProvider>
    </AmountDisplayProvider>
  );
}
